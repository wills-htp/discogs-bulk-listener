// Background service worker for Chrome Extension
// Handles extraction orchestration, API calls, and state management


// State management
let extractionState = {
  isExtracting: false,
  currentIndex: 0,
  totalRecords: 0,
  records: [],
  videosFound: 0,
  videosSkipped: 0,
  cancelled: false
};

// Logging array - will be saved to file
let sessionLog = [];

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, message, data };
  sessionLog.push(logEntry);
}

// Configuration
const CONFIG = {
  youtube: {
    scope: 'https://www.googleapis.com/auth/youtube'
  },
  requestDelay: 2000,
  maxRetries: 2
};

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── YouTube API Authentication ─────────────────────────────────────────────────

// The GitHub Pages callback page that receives the OAuth redirect from Google,
// then bounces the code back to the extension via the chromiumapp.org URL in state.
const OAUTH_CALLBACK_URL = 'https://wills-htp.github.io/discogs-bulk-listener/callback.html';

// Launch OAuth 2.0 authorization code + PKCE flow.
// Uses a GitHub Pages callback page as the redirect URI (Google accepts real HTTPS domains;
// it rejects chromiumapp.org for Web Application clients). The callback page immediately
// redirects to the extension's chromiumapp.org URL (passed as state), which Chrome intercepts.
async function launchAuthFlow(interactive) {
  const { youtubeClientId, youtubeClientSecret } = await chrome.storage.local.get(['youtubeClientId', 'youtubeClientSecret']);
  if (!youtubeClientId) {
    throw new Error('YouTube Client ID not configured. Please complete setup in Settings.');
  }
  if (!youtubeClientSecret) {
    throw new Error('YouTube Client Secret not configured. Please complete setup in Settings.');
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const extensionRedirectUrl = chrome.identity.getRedirectURL();

  const authURL = 'https://accounts.google.com/o/oauth2/auth?' +
    'client_id=' + encodeURIComponent(youtubeClientId) + '&' +
    'response_type=code&' +
    'redirect_uri=' + encodeURIComponent(OAUTH_CALLBACK_URL) + '&' +
    'scope=' + encodeURIComponent(CONFIG.youtube.scope) + '&' +
    'code_challenge=' + codeChallenge + '&' +
    'code_challenge_method=S256&' +
    'access_type=offline&' +
    'prompt=consent&' +
    'state=' + encodeURIComponent(extensionRedirectUrl);

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authURL, interactive }, async (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        reject(chrome.runtime.lastError || new Error('No redirect URL'));
        return;
      }
      try {
        // Chrome intercepts when callback.html redirects to the chromiumapp.org URL.
        // The code is in the query params of that final URL.
        const finalUrl = new URL(redirectedTo);
        const code = finalUrl.searchParams.get('code');
        const error = finalUrl.searchParams.get('error');
        if (error) { reject(new Error('Auth error: ' + error)); return; }
        if (!code) { reject(new Error('No authorization code received')); return; }

        // Token exchange — redirect_uri must match what was sent to Google (the GitHub Pages URL)
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: youtubeClientId,
            client_secret: youtubeClientSecret,
            redirect_uri: OAUTH_CALLBACK_URL,
            grant_type: 'authorization_code',
            code_verifier: codeVerifier
          })
        });

        const tokens = await tokenRes.json();
        if (tokens.access_token) {
          const toStore = { youtubeAccessToken: tokens.access_token };
          if (tokens.refresh_token) toStore.youtubeRefreshToken = tokens.refresh_token;
          await chrome.storage.local.set(toStore);
          resolve(tokens.access_token);
        } else {
          reject(new Error(tokens.error_description || tokens.error || 'Failed to get access token'));
        }
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Authenticate interactively (called from Settings / setup guide)
async function authenticateYouTube() {
  return await launchAuthFlow(true);
}

// Silently refresh the access token using the stored refresh token.
async function refreshAccessToken(refreshToken) {
  const { youtubeClientId, youtubeClientSecret } = await chrome.storage.local.get(['youtubeClientId', 'youtubeClientSecret']);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: youtubeClientId,
      client_secret: youtubeClientSecret,
      grant_type: 'refresh_token'
    })
  });
  const tokens = await res.json();
  if (tokens.access_token) {
    await chrome.storage.local.set({ youtubeAccessToken: tokens.access_token });
    return tokens.access_token;
  }
  throw new Error('Token refresh failed: ' + (tokens.error_description || tokens.error || 'unknown'));
}

// Return a valid access token, refreshing silently via refresh token when possible.
// Do NOT fall back to interactive OAuth here — opening an auth window while the popup
// is open causes Chrome to close the popup, leaving the user confused about extraction.
async function ensureValidToken() {
  const { youtubeAccessToken, youtubeRefreshToken } = await chrome.storage.local.get([
    'youtubeAccessToken', 'youtubeRefreshToken'
  ]);

  if (youtubeAccessToken) {
    const testRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', {
      headers: { 'Authorization': `Bearer ${youtubeAccessToken}` }
    });
    if (testRes.ok) return youtubeAccessToken;

    const errorData = await testRes.json();
    const errorMsg = errorData.error?.message || '';
    if (errorMsg.toLowerCase().includes('quota')) {
      log('Pre-flight warning: Quota may be exceeded');
      return youtubeAccessToken;
    }
  }

  if (youtubeRefreshToken) {
    log('Access token expired, attempting silent refresh via refresh token...');
    try {
      const token = await refreshAccessToken(youtubeRefreshToken);
      log('Silent token refresh succeeded');
      return token;
    } catch {
      log('Refresh token silent refresh failed');
    }
  }

  throw new Error('YouTube authentication expired. Please reconnect in Settings.');
}

// Create YouTube playlist
async function createYouTubePlaylist(records, playlistName) {
  try {
    // Get a valid access token, refreshing silently if needed
    const youtubeAccessToken = await ensureValidToken();

    // Collect all video IDs from all records
    const allVideoIds = [];
    records.forEach(record => {
      if (record.videoIds && Array.isArray(record.videoIds)) {
        // Record has multiple videos
        allVideoIds.push(...record.videoIds);
      } else if (record.videoId) {
        // Record has single video (backwards compatibility)
        allVideoIds.push(record.videoId);
      }
    });
    
    if (allVideoIds.length === 0) {
      throw new Error('No videos found to create playlist');
    }

    log(`Creating playlist with ${allVideoIds.length} videos from ${records.length} records`);
    
    // Estimate quota needed
    const quotaNeeded = 50 + (allVideoIds.length * 50); // 50 for playlist creation + 50 per video
    log(`Estimated quota needed: ${quotaNeeded} units (daily limit is 10,000)`);
    
    if (quotaNeeded > 10000) {
      log(`WARNING: This operation needs ${quotaNeeded} quota units but daily limit is 10,000. Will attempt but may fail partway through.`);
    }

    // Create playlist
    const playlistResponse = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${youtubeAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        snippet: {
          title: playlistName,
          description: 'Created by Discogs Bulk Listener'
        },
        status: {
          privacyStatus: 'private'
        }
      })
    });

    if (!playlistResponse.ok) {
      const error = await playlistResponse.json();
      const errorMsg = `Failed to create playlist: ${error.error?.message || 'Unknown error'}`;
      log(errorMsg, error);
      
      // Save log before throwing error
      await saveLogToFile();
      
      throw new Error(errorMsg);
    }

    const playlist = await playlistResponse.json();
    const playlistId = playlist.id;

    await incrementQuota(QUOTA_PLAYLIST_COST);
    log(`Playlist created: ${playlistId}`);

    // Add all videos to playlist
    let addedCount = 0;
    let failedCount = 0;
    let failedVideos = [];
    
    for (const videoId of allVideoIds) {
      let retries = 0;
      let success = false;
      while (retries <= CONFIG.maxRetries && !success) {
        try {
          const response = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${youtubeAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              snippet: {
                playlistId: playlistId,
                resourceId: {
                  kind: 'youtube#video',
                  videoId: videoId
                }
              }
            })
          });

          if (response.ok) {
            addedCount++;
            success = true;
            await incrementQuota(QUOTA_VIDEO_COST);
            if (addedCount % 50 === 0) { // Log every 50 videos
              log(`Progress: ${addedCount}/${allVideoIds.length} videos added`);
            }
          } else {
            const errorData = await response.json();
            const errorMsg = errorData.error?.message || response.statusText;

            if (retries < CONFIG.maxRetries) {
              log(`Retrying video ${videoId} (attempt ${retries + 1}/${CONFIG.maxRetries + 1}): ${errorMsg}`);
              await sleep(1000 * (retries + 1)); // Exponential backoff
            } else {
              failedCount++;
              failedVideos.push({ videoId, error: errorMsg });
              log(`Failed to add video ${videoId} after ${CONFIG.maxRetries + 1} attempts: ${errorMsg}`);
            }
          }
        } catch (error) {
          if (retries < CONFIG.maxRetries) {
            log(`Retrying video ${videoId} (attempt ${retries + 1}/${CONFIG.maxRetries + 1}): ${error.message}`);
            await sleep(1000 * (retries + 1)); // Exponential backoff
          } else {
            failedCount++;
            failedVideos.push({ videoId, error: error.message });
            log(`Error adding video ${videoId} after ${CONFIG.maxRetries + 1} attempts: ${error.message}`);
          }
        }
        retries++;
      }
      // Longer delay to avoid rate limiting - 500ms between videos
      await sleep(500);
    }
    
    const summary = `Playlist creation complete: ${addedCount} added, ${failedCount} failed out of ${allVideoIds.length} total`;
    log(summary, { failedVideos });
    
    // Save log to file
    await saveLogToFile();

    return {
      playlistId: playlistId,
      playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`
    };
  } catch (error) {
    // Save log even if playlist creation fails
    await saveLogToFile();
    
    throw error;
  }
}

// Start extraction process
async function startExtraction(records) {
  sessionLog = []; // Reset log for new session
  
  // Pre-flight check: Ensure we have a valid YouTube token (auto-refreshes if expired)
  try {
    await ensureValidToken();
  } catch (error) {
    log('Pre-flight check failed: ' + error.message);
    throw error;
  }
  
  extractionState = {
    isExtracting: true,
    currentIndex: 0,
    totalRecords: records.length,
    records: records,
    videosFound: 0,
    videosSkipped: 0,
    cancelled: false
  };

  log(`Starting extraction of ${records.length} records`);

  // Create a minimized background window so extraction tabs don't appear in the user's browser
  const bgWindow = await chrome.windows.create({ url: 'about:blank', state: 'minimized', focused: false });
  const bgWindowId = bgWindow.id;

  try {
    // Process each record
    for (let i = 0; i < records.length; i++) {
      if (extractionState.cancelled) {
        break;
      }

      extractionState.currentIndex = i;
      const record = records[i];

      try {
        // Extract videos and format from release page
        const { videoIds, format } = await extractVideoFromRelease(record.discogsUrl, bgWindowId);

        // Update format if it was unknown and we got one from the release page
        if (format && record.format === 'Unknown') {
          record.format = format;
        }

        if (videoIds && videoIds.length > 0) {
          record.videoIds = videoIds;
          record.videoId = videoIds[0]; // Keep first for backwards compatibility
          extractionState.videosFound += videoIds.length;
          log(`[${i + 1}/${records.length}] Found ${videoIds.length} video(s)`, { url: record.discogsUrl, videoIds });
        } else {
          extractionState.videosSkipped++;
          log(`[${i + 1}/${records.length}] No videos found`, { url: record.discogsUrl });
        }

        notifyProgress();
        await sleep(CONFIG.requestDelay);
      } catch (error) {
        log(`Error extracting videos from ${record.discogsUrl}: ${error.message}`, error);
        extractionState.videosSkipped++;
        await saveLogToFile();
      }
    }
  } finally {
    // Always close the background window, even if extraction threw or was cancelled
    extractionState.isExtracting = false;
    await chrome.windows.remove(bgWindowId).catch(() => {});
  }

  return extractionState.records;
}

// Extract video from a release page (now just one page to visit!)
async function extractVideoFromRelease(releaseUrl, windowId) {
  try {

    // Open the release page in the background window (hidden from user)
    const tabOptions = { url: releaseUrl, active: false };
    if (windowId) tabOptions.windowId = windowId;
    const releaseTab = await chrome.tabs.create(tabOptions);
    
    // Wait for page to fully load and for videos to lazy-load
    await sleep(5000);

    let videoResults;
    try {
      // Extract YouTube video IDs and format from release page
      videoResults = await chrome.scripting.executeScript({
        target: { tabId: releaseTab.id },
        func: () => {
          return new Promise((resolve) => {
            // Extract format from the Discogs release page profile table
            // Discogs uses a .head/.content pattern: <td class="head">Format</td><td class="content">...</td>
            let format = '';
            const headings = document.querySelectorAll('.head');
            for (const h of headings) {
              if (h.textContent.trim() === 'Format') {
                const contentEl = h.nextElementSibling;
                if (contentEl) {
                  format = contentEl.textContent.trim().replace(/\s+/g, ' ');
                }
                break;
              }
            }

            // Method 1: Try to get video IDs from YouTube thumbnail URLs in the HTML
            // Discogs shows thumbnails like: https://i.ytimg.com/vi/VIDEO_ID/default.jpg
            const thumbnailPattern = /i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})\//g;
            const html = document.documentElement.innerHTML;
            const thumbnailMatches = [...html.matchAll(thumbnailPattern)];
            const videoIds = [...new Set(thumbnailMatches.map(m => m[1]))];

            if (videoIds.length > 0) {
              resolve({ videoIds, format });
              return;
            }

            // Method 2: Click buttons and wait for iframes
            const videoButtons = document.querySelectorAll('button.video_oIeBc, button[class*="video"]');
            videoButtons.forEach(btn => btn.click());

            setTimeout(() => {
              const iframes = document.querySelectorAll('iframe[src*="youtube"]');

              function extractId(url) {
                if (!url) return null;
                const match = url.match(/(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                return match ? match[1] : null;
              }

              const iframeIds = [];
              for (const iframe of iframes) {
                const id = extractId(iframe.src);
                if (id && !iframeIds.includes(id)) iframeIds.push(id);
              }

              resolve({ videoIds: iframeIds, format });
            }, 2000);
          });
        }
      });
    } finally {
      // Always close the tab, even if script execution threw
      await chrome.tabs.remove(releaseTab.id).catch(() => {});
    }

    const result = videoResults?.[0]?.result || { videoIds: [], format: '' };
    const videoIds = result.videoIds || [];
    const format = result.format || '';

    return { videoIds, format };
  } catch (error) {
    return { videoIds: [], format: '' };
  }
}

// Notify popup of progress
function notifyProgress() {
  chrome.runtime.sendMessage({
    action: 'extractionProgress',
    data: {
      currentIndex: extractionState.currentIndex,
      totalRecords: extractionState.totalRecords,
      videosFound: extractionState.videosFound,
      videosSkipped: extractionState.videosSkipped
    }
  }).catch(() => {
    // Popup might be closed, ignore error
  });
}

// Utility function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Quota tracking ────────────────────────────────────────────────────────────
// YouTube quota resets at midnight Pacific Time (UTC-8 / UTC-7 DST).
// We track units used locally and reset when the Pacific date changes.
// Cost: 50 units per playlist create + 50 units per video added = ~199 videos/day.

const QUOTA_DAILY_LIMIT = 10000;
const QUOTA_PLAYLIST_COST = 50;
const QUOTA_VIDEO_COST = 50;

function getPacificDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

async function getQuotaState() {
  const { quotaDate, quotaUsed } = await chrome.storage.local.get(['quotaDate', 'quotaUsed']);
  const today = getPacificDateString();
  if (quotaDate !== today) {
    // New day — reset
    await chrome.storage.local.set({ quotaDate: today, quotaUsed: 0 });
    return 0;
  }
  return quotaUsed || 0;
}

async function incrementQuota(units) {
  const used = await getQuotaState();
  const newUsed = used + units;
  await chrome.storage.local.set({ quotaUsed: newUsed });
  return newUsed;
}

async function getRemainingVideos() {
  const used = await getQuotaState();
  const remaining = Math.max(0, QUOTA_DAILY_LIMIT - used);
  return Math.floor(remaining / QUOTA_VIDEO_COST);
}

// Save log to chrome storage and console (service workers can't use URL.createObjectURL)
async function saveLogToFile() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('Z')[0];
    
    // Create human-readable log text
    let logText = '=== DISCOGS BULK LISTENER EXTRACTION LOG ===\n\n';
    logText += `Session Date: ${new Date().toISOString()}\n`;
    logText += `Total Records: ${extractionState.totalRecords}\n`;
    logText += `Videos Found: ${extractionState.videosFound}\n`;
    logText += `Videos Skipped: ${extractionState.videosSkipped}\n\n`;
    logText += '=== DETAILED LOG ===\n\n';
    
    sessionLog.forEach(entry => {
      logText += `[${entry.timestamp}] ${entry.message}\n`;
      if (entry.data) {
        logText += `  Data: ${JSON.stringify(entry.data, null, 2)}\n`;
      }
      logText += '\n';
    });
    
    // Save to chrome.storage.local for retrieval
    const logData = {
      timestamp,
      session: {
        timestamp: new Date().toISOString(),
        totalRecords: extractionState.totalRecords,
        videosFound: extractionState.videosFound,
        videosSkipped: extractionState.videosSkipped
      },
      log: sessionLog,
      logText: logText
    };
    
    await chrome.storage.local.set({ lastExtractionLog: logData });
    
  } catch {
    // Storage save failed silently — log is still available in sessionLog array
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only accept messages from this extension itself
  if (sender.id !== chrome.runtime.id) return;

  if (request.action === 'startFullExtraction') {
    // New unified action that handles everything
    const { records, playlistName } = request;
    
    // Start extraction and playlist creation all in background
    (async () => {
      try {
        // Extract videos
        const recordsWithVideos = await startExtraction(records);

        // If the user cancelled, stop here without creating a playlist
        if (extractionState.cancelled) {
          await saveLogToFile();
          chrome.runtime.sendMessage({
            action: 'extractionComplete',
            success: false,
            error: 'Extraction cancelled'
          }).catch(() => {});
          return;
        }

        // Don't save log here - wait until after playlist creation

        // Create playlist
        const playlistResult = await createYouTubePlaylist(recordsWithVideos, playlistName);
        
        // Send success with session data
        chrome.runtime.sendMessage({
          action: 'extractionComplete',
          success: true,
          sessionData: {
            playlistId: playlistResult.playlistId,
            playlistUrl: playlistResult.playlistUrl,
            records: recordsWithVideos,
            createdAt: new Date().toISOString()
          }
        }).catch(() => {}); // Popup might be closed
        
      } catch (error) {
        
        // Send error message
        chrome.runtime.sendMessage({
          action: 'extractionComplete',
          success: false,
          error: error.message
        }).catch(() => {});
        
        // Also send immediate response for popup
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Will respond asynchronously
  }

  if (request.action === 'startExtraction') {
    startExtraction(request.records)
      .then(records => {
        sendResponse({ success: true, records: records });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Will respond asynchronously
  }

  if (request.action === 'cancelExtraction') {
    extractionState.cancelled = true;
    extractionState.isExtracting = false;
    sendResponse({ success: true });
  }

  if (request.action === 'createPlaylist') {
    createYouTubePlaylist(request.records, request.playlistName)
      .then(result => {
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'authenticateYouTube') {
    authenticateYouTube()
      .then(token => {
        sendResponse({ success: true, token: token });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'getExtractionState') {
    sendResponse(extractionState);
  }

  if (request.action === 'getQuotaRemaining') {
    getRemainingVideos().then(remaining => sendResponse({ remaining }));
    return true;
  }

  if (request.action === 'checkYouTubeToken') {
    ensureValidToken()
      .then(() => sendResponse({ valid: true }))
      .catch(() => sendResponse({ valid: false }));
    return true;
  }
});

