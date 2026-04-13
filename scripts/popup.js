// Popup script - handles UI interactions and coordinates with background/content scripts


// UI state
let currentRecords = [];
let sessionData = null;
let paginationData = null;
let allPageUrls = [];

// DOM elements
const screens = {
  main: document.getElementById('main-screen'),
  settings: document.getElementById('settings-screen'),
  setup: document.getElementById('setup-screen'),
  error: document.getElementById('error-view')
};

const views = {
  detection: document.getElementById('detection-view'),
  extraction: document.getElementById('extraction-view'),
  completion: document.getElementById('completion-view')
};

const elements = {
  recordCount: document.getElementById('record-count'),
  startBtn: document.getElementById('start-extraction-btn'),
  cancelBtn: document.getElementById('cancel-extraction-btn'),
  openPlaylistBtn: document.getElementById('open-playlist-btn'),
  newSessionBtn: document.getElementById('new-session-btn'),
  downloadLogBtn: document.getElementById('download-log-btn'),
  openLogViewerBtn: document.getElementById('open-log-viewer-btn'),
  openSettingsBtn: document.getElementById('open-settings-btn'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  
  // Progress elements
  progressText: document.getElementById('extraction-progress'),
  progressPercent: document.getElementById('extraction-percent'),
  progressFill: document.getElementById('progress-fill'),
  pitchCursor: document.getElementById('pitch-cursor'),
  videosFound: document.getElementById('videos-found'),
  videosSkipped: document.getElementById('videos-skipped'),
  timeRemaining: document.getElementById('time-remaining'),
  
  // Completion elements
  finalVideoCount: document.getElementById('final-video-count'),
  finalSkippedCount: document.getElementById('final-skipped-count'),
  
  // Settings elements
  connectYouTubeBtn: document.getElementById('connect-youtube-btn'),
  youtubeStatus: document.getElementById('youtube-status'),
  youtubeClientIdInput: document.getElementById('youtube-client-id-input'),
  saveYoutubeClientIdBtn: document.getElementById('save-youtube-client-id-btn'),
  discogsStatus: document.getElementById('discogs-status'),
  discogsTokenInput: document.getElementById('discogs-token-input'),
  saveDiscogsTokenBtn: document.getElementById('save-discogs-token-btn'),
  
  // Error elements
  errorMessage: document.getElementById('error-message'),
  retryBtn: document.getElementById('retry-btn'),
  downloadLogErrorBtn: document.getElementById('download-log-error-btn'),
  backBtn: document.getElementById('back-btn'),

  // Quota display
  quotaRemaining: document.getElementById('quota-remaining'),
  timeEstimate: document.getElementById('time-estimate')
};

function showTimeEstimate(count) {
  if (!elements.timeEstimate || count <= 0) return;
  const totalSec = count * 7;
  const mins = Math.round(totalSec / 60);
  const label = mins < 1 ? 'under 1 min' : `~${mins} min`;
  elements.timeEstimate.textContent = `Keep this window open — extraction takes ${label} (${count} records × ~7 sec each)`;
  elements.timeEstimate.classList.remove('hidden');
}

// Sync the pitch-track fill and cursor together
function setProgress(pct) {
  const p = `${pct}%`;
  elements.progressFill.style.width = p;
  if (elements.pitchCursor) elements.pitchCursor.style.left = p;
}

// Initialize
async function init() {
  // Set up event listeners first (needed for setup wizard too)
  setupEventListeners();

  // Show setup wizard if any required credential is missing
  const { youtubeClientId, discogsToken, youtubeAccessToken } = await chrome.storage.local.get(['youtubeClientId', 'discogsToken', 'youtubeAccessToken']);
  if (!youtubeClientId || !discogsToken || !youtubeAccessToken) {
    showSetup();
    return;
  }

  // If extraction is already running in the background (e.g. popup was closed
  // during OAuth or the user clicked away), jump straight to the progress view
  // instead of showing the detection screen — this prevents accidental duplicate
  // extractions when the user sees no visible activity and clicks START again.
  const state = await chrome.runtime.sendMessage({ action: 'getExtractionState' });
  if (state && state.isExtracting) {
    showView('extraction');
    updateProgress(state.currentIndex, state.totalRecords, state.videosFound, state.videosSkipped);
    startProgressListener();
    return;
  }

  // Check if we're on a supported Discogs page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes('discogs.com/seller/') && !tab.url.includes('discogs.com/label/') && !tab.url.includes('discogs.com/artist/')) {
    showError('Please navigate to a Discogs seller, label, or artist page');
    return;
  }

  await updateAuthStatus();
  await detectRecords();
  await updateQuotaDisplay();
  await checkYouTubeTokenOnInit();
}

async function checkYouTubeTokenOnInit() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkYouTubeToken' });
    if (!response?.valid) {
      elements.startBtn.disabled = true;
      const quotaEl = elements.quotaRemaining;
      if (quotaEl) {
        quotaEl.textContent = 'YouTube disconnected — reconnect in Settings';
        quotaEl.classList.remove('hidden', 'low');
        quotaEl.classList.add('auth-warning');
      }
    }
  } catch {
    // Non-blocking — if check fails, let extraction attempt surface the error
  }
}

async function updateQuotaDisplay() {
  if (!elements.quotaRemaining) return;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getQuotaRemaining' });
    const remaining = response?.remaining ?? 199;
    elements.quotaRemaining.textContent = `~ ${remaining} videos remaining (since last reset)`;
    elements.quotaRemaining.classList.remove('hidden', 'low');
    if (remaining < 50) elements.quotaRemaining.classList.add('low');
  } catch {
    // Non-critical — hide silently
    elements.quotaRemaining.classList.add('hidden');
  }
}

// Highlight the active page type badge
function updatePageTypeBadges(pageType) {
  ['seller', 'label', 'artist'].forEach(type => {
    const badge = document.getElementById(`badge-${type}`);
    if (badge) badge.classList.toggle('active', type === pageType);
  });
}

// Detect records on current page
async function detectRecords() {
  try {
    elements.recordCount.textContent = 'Checking page...';
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectRecords' });
    
    if (response.success) {
      currentRecords = response.records;
      if (response.labelName) currentRecords.labelName = response.labelName;
      if (response.artistName) currentRecords.artistName = response.artistName;
      updatePageTypeBadges(response.pageType);
      paginationData = response.pagination;
      allPageUrls = response.pageUrls;
      
      const count = response.count;
      
      if (count === 0) {
        elements.recordCount.textContent = 'No records found on this page';
        elements.startBtn.disabled = true;
        document.getElementById('pagination-options').classList.add('hidden');
      } else {
        elements.recordCount.textContent = `Found ${count} record${count !== 1 ? 's' : ''}`;
        
        // Show pagination info if multiple pages exist
        if (paginationData.totalPages > 1) {
          const paginationInfo = document.getElementById('pagination-info');
          paginationInfo.textContent = `Page ${paginationData.currentPage} of ${paginationData.totalPages} (${paginationData.totalRecords} total records)`;
          paginationInfo.classList.remove('hidden');
          
          // Show pagination options
          const paginationOptions = document.getElementById('pagination-options');
          paginationOptions.classList.remove('hidden');
          
          // Update counts
          document.getElementById('current-page-count').textContent = count;
          document.getElementById('all-pages-count').textContent = paginationData.totalRecords;
          document.getElementById('total-pages').textContent = paginationData.totalPages;
        } else {
          document.getElementById('pagination-info').classList.add('hidden');
          document.getElementById('pagination-options').classList.add('hidden');
        }
        
        elements.startBtn.disabled = false;
        const estimateCount = paginationData.totalPages > 1 ? paginationData.totalRecords : count;
        showTimeEstimate(estimateCount);
      }
    } else {
      showError('Could not detect records: ' + response.error);
    }
  } catch (error) {
    const isConnectionError = error?.message?.includes('Receiving end does not exist') ||
                              error?.message?.includes('Could not establish connection');
    if (isConnectionError) {
      // Content script is gone — likely because the extension was reloaded.
      // Re-inject it programmatically and retry once.
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['scripts/content.js']
        });
        await sleep(300);
        await detectRecords();
      } catch {
        showError('Page still loading — please wait a moment and try again.');
      }
    } else {
      showError('Could not read page. Make sure you are on a Discogs seller, label, or artist page.');
    }
  }
}

// Start extraction process
async function startExtraction() {
  if (currentRecords.length === 0) {
    showError('No records to extract');
    return;
  }

  // Check authentication
  const { youtubeAccessToken } = await chrome.storage.local.get('youtubeAccessToken');
  if (!youtubeAccessToken) {
    showError('Please connect your YouTube account in Settings');
    return;
  }

  // Check if user wants all pages
  const selectedOption = document.querySelector('input[name="page-option"]:checked');
  const extractAllPages = selectedOption && selectedOption.value === 'all';
  
  let recordsToExtract = currentRecords;
  
  // If extracting all pages, collect records from all pages first
  if (extractAllPages && paginationData && paginationData.totalPages > 1) {
    showView('extraction');
    elements.progressText.textContent = 'Collecting records from all pages...';
    elements.progressPercent.textContent = '';
    setProgress(0);
    
    try {
      recordsToExtract = await collectRecordsFromAllPages();
    } catch (error) {
      showError('Failed to collect records from all pages: ' + error.message);
      return;
    }
  }

  // Switch to extraction view
  showView('extraction');
  
  // Reset progress
  updateProgress(0, recordsToExtract.length, 0, 0);
  
  // Generate playlist name from seller/label and filters
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url);
  
  let baseName;
  
  // Check page type for playlist naming
  if (url.pathname.includes('/label/')) {
    baseName = currentRecords.labelName || 'Unknown Label';
  } else if (url.pathname.includes('/artist/')) {
    baseName = currentRecords.artistName || 'Unknown Artist';
  } else {
    // For seller pages, extract from URL
    const pathMatch = url.pathname.match(/\/seller\/([^\/]+)/);
    baseName = pathMatch ? pathMatch[1] : 'Unknown Seller';
    
    // Extract filters from query parameters (sellers only)
    const filters = [];
    
    // Style/Genre filters
    const styles = url.searchParams.getAll('style');
    if (styles.length > 0) {
      filters.push(styles.join(', '));
    }
    
    const genre = url.searchParams.get('genre');
    if (genre) {
      filters.push(genre);
    }
    
    // Price filter
    const price = url.searchParams.get('price');
    if (price) {
      filters.push(`$${price.replace('to', '-')}`);
    }
    
    // Format filter
    const format = url.searchParams.get('format');
    if (format) {
      filters.push(format);
    }
    
    // Add filters to name if present
    if (filters.length > 0) {
      baseName += ' - ' + filters.join(' • ');
    }
  }
  
  // Build playlist name — strip any HTML characters before sending to YouTube API
  let playlistName = baseName.replace(/[<>"']/g, '');

  // Add record count
  playlistName += ` (${recordsToExtract.length} records)`;
  
  // Add date
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  playlistName += ` - ${date}`;
  
  // Start extraction AND playlist creation in background (so popup can close)
  chrome.runtime.sendMessage(
    { 
      action: 'startFullExtraction', 
      records: recordsToExtract,
      playlistName: playlistName
    },
    (response) => {
      // This might not get called if popup closes, but that's OK
      if (response && !response.success) {
        // Show error if extraction failed immediately
        showError(response.error || 'Extraction failed');
      }
    }
  );
  
  // Start listening for progress updates
  startProgressListener();
  
  // Show message that popup can be closed
  setTimeout(() => {
    const statusEl = document.createElement('p');
    statusEl.style.textAlign = 'center';
    statusEl.style.fontSize = '13px';
    statusEl.style.color = '#667eea';
    statusEl.style.marginTop = '10px';
    statusEl.textContent = '✓ You can close this popup - extraction continues in background';
    document.getElementById('extraction-view').appendChild(statusEl);
  }, 2000);
}

// Collect records from all pages
async function collectRecordsFromAllPages() {
  const allRecords = [];
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  for (let i = 0; i < allPageUrls.length; i++) {
    const pageUrl = allPageUrls[i];
    
    // Update progress
    elements.progressText.textContent = `Loading page ${i + 1} of ${allPageUrls.length}...`;
    const percent = Math.round(((i + 1) / allPageUrls.length) * 100);
    elements.progressPercent.textContent = `${percent}%`;
    setProgress(percent);
    
    try {
      // Navigate to the page
      await chrome.tabs.update(currentTab.id, { url: pageUrl });
      
      // Wait for page to load
      await sleep(2000);
      
      // Extract records from this page
      const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'detectRecords' });
      
      if (response.success && response.records.length > 0) {
        allRecords.push(...response.records);
      }
      
      // Small delay between pages
      await sleep(500);
    } catch {
      // Continue with other pages
    }
  }
  
  return allRecords;
}

// Utility sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Guard against registering multiple listeners if the popup is reopened mid-extraction
let progressListenerActive = false;

// Listen for progress updates from background script
function startProgressListener() {
  if (progressListenerActive) return;
  progressListenerActive = true;

  chrome.runtime.onMessage.addListener(function progressListener(request) {
    if (request.action === 'extractionProgress') {
      const { currentIndex, totalRecords, videosFound, videosSkipped } = request.data;
      updateProgress(currentIndex + 1, totalRecords, videosFound, videosSkipped);
    }
    
    if (request.action === 'extractionComplete') {
      progressListenerActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);

      // Extraction and playlist creation finished
      if (request.success) {
        // Save session data to storage AND in-memory variable
        sessionData = request.sessionData;
        chrome.storage.local.set({ currentSession: request.sessionData });
        
        // Show completion view
        const records = request.sessionData.records;
        const videosFound = records.filter(r => r.videoIds?.length > 0 || r.videoId).length;
        const videosSkipped = records.length - videosFound;

        // Update detection view summary for when user returns
        elements.recordCount.textContent = `Found ${records.length} record${records.length !== 1 ? 's' : ''} · ${videosFound} video${videosFound !== 1 ? 's' : ''}`;

        elements.finalVideoCount.textContent = videosFound;
        elements.finalSkippedCount.textContent = videosSkipped;

        showView('completion');
        updateQuotaDisplay();
      } else {
        // Check if it's an authentication error
        if (request.error && request.error.includes('authentication')) {
          showError(
            '⚠️ YouTube Connection Expired\n\n' +
            'Your YouTube session has expired. To fix this:\n\n' +
            '1. Click "Settings" below\n' +
            '2. Click "Connect YouTube"\n' +
            '3. Approve permissions\n' +
            '4. Try extraction again'
          );
        } else {
          showError('Extraction failed: ' + request.error);
        }
      }
    }
  });
}

// Update progress UI
function updateProgress(current, total, found, skipped) {
  const percent = Math.round((current / total) * 100);
  
  elements.progressText.textContent = `${current}/${total}`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
  elements.videosFound.textContent = found;
  elements.videosSkipped.textContent = skipped;

  const label = document.getElementById('extraction-label');
  if (label) {
    if (percent >= 100) {
      label.textContent = 'BUILDING PLAYLIST...';
      label.classList.add('building');
    } else {
      label.textContent = 'EXTRACTING';
      label.classList.remove('building');
    }
  }
  
  // Calculate estimated time remaining
  if (current > 0 && current < total) {
    const avgTime = 1.5; // seconds per record
    const remaining = (total - current) * avgTime;
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.round(remaining % 60);
    elements.timeRemaining.textContent = minutes > 0 
      ? `${minutes}m ${seconds}s` 
      : `${seconds}s`;
  } else {
    elements.timeRemaining.textContent = '--';
  }
}

// Create YouTube playlist
async function createPlaylist(records) {
  try {
    // Generate playlist name
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const playlistName = `Discogs Bulk Listener - ${date}`;
    
    const response = await chrome.runtime.sendMessage({
      action: 'createPlaylist',
      records: records,
      playlistName: playlistName
    });
    
    if (response.success) {
      // Save session data
      sessionData = {
        playlistId: response.playlistId,
        playlistUrl: response.playlistUrl,
        records: records,
        createdAt: new Date().toISOString()
      };
      
      // Show completion view
      showCompletion(records);
    } else {
      showError('Failed to create playlist: ' + response.error);
    }
  } catch (error) {
    showError('Error creating playlist: ' + error.message);
  }
}

// Show completion view
function showCompletion(records) {
  const videosFound = records.filter(r => r.videoId).length;
  const videosSkipped = records.length - videosFound;
  
  elements.finalVideoCount.textContent = videosFound;
  elements.finalSkippedCount.textContent = videosSkipped;
  
  showView('completion');
}

// Open listening interface
async function openYouTubePlaylist() {
  // Check in-memory sessionData first
  let playlistUrl = sessionData?.playlistUrl;
  
  // If not in memory, try to load from storage
  if (!playlistUrl) {
    const stored = await chrome.storage.local.get('currentSession');
    playlistUrl = stored.currentSession?.playlistUrl;
  }
  
  if (!playlistUrl) {
    showError('No playlist URL available');
    return;
  }
  
  // Open the YouTube playlist in a new tab
  await chrome.tabs.create({ url: playlistUrl });
}

// Download extraction log
async function downloadLog() {
  try {
    const { lastExtractionLog } = await chrome.storage.local.get('lastExtractionLog');
    
    if (!lastExtractionLog) {
      alert('No extraction log found. Complete an extraction first.');
      return;
    }
    
    // Create downloadable text file
    const logText = lastExtractionLog.logText;
    
    try {
      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `extraction-log-${lastExtractionLog.timestamp}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Also save JSON version
      const jsonBlob = new Blob([JSON.stringify(lastExtractionLog, null, 2)], { type: 'application/json' });
      const jsonUrl = URL.createObjectURL(jsonBlob);
      const jsonA = document.createElement('a');
      jsonA.href = jsonUrl;
      jsonA.download = `extraction-log-${lastExtractionLog.timestamp}.json`;
      document.body.appendChild(jsonA);
      jsonA.click();
      document.body.removeChild(jsonA);
      URL.revokeObjectURL(jsonUrl);
      
      alert('Log files downloaded! Check your Downloads folder.');
    } catch {
      // Fallback: Copy to clipboard
      await navigator.clipboard.writeText(logText);
      alert('Download failed, but log has been copied to your clipboard! Paste it into a text file.');
    }
  } catch (error) {
    alert('Failed to download log: ' + error.message);
  }
}

// Update authentication status
async function updateAuthStatus() {
  const { youtubeAccessToken, discogsToken, youtubeClientId } = await chrome.storage.local.get(['youtubeAccessToken', 'discogsToken', 'youtubeClientId']);

  // YouTube OAuth status
  if (youtubeAccessToken) {
    elements.youtubeStatus.textContent = 'Connected';
    elements.youtubeStatus.classList.add('connected');
  } else {
    elements.youtubeStatus.textContent = 'Not Connected';
    elements.youtubeStatus.classList.remove('connected');
  }

  // YouTube Client ID status
  const clientIdStatusEl = document.getElementById('youtube-client-id-status');
  if (clientIdStatusEl) {
    if (youtubeClientId) {
      clientIdStatusEl.textContent = 'Set';
      clientIdStatusEl.classList.add('connected');
      elements.youtubeClientIdInput.value = '********';
    } else {
      clientIdStatusEl.textContent = 'Not Set';
      clientIdStatusEl.classList.remove('connected');
      elements.youtubeClientIdInput.value = '';
    }
  }

  // Discogs token status
  if (discogsToken) {
    elements.discogsStatus.textContent = 'Connected';
    elements.discogsStatus.classList.add('connected');
  } else {
    elements.discogsStatus.textContent = 'Not Connected';
    elements.discogsStatus.classList.remove('connected');
  }
}

  async function connectYouTube() {
  try {
    elements.connectYouTubeBtn.disabled = true;
    elements.connectYouTubeBtn.textContent = 'Connecting...';
    
    const response = await chrome.runtime.sendMessage({ action: 'authenticateYouTube' });
    
    if (response.success) {
      await updateAuthStatus();
      alert('YouTube connected successfully!');
    } else {
      showError('Failed to connect YouTube: ' + response.error);
    }
  } catch (error) {
    showError('Error connecting YouTube: ' + error.message);
  } finally {
    elements.connectYouTubeBtn.disabled = false;
    elements.connectYouTubeBtn.textContent = 'Connect YouTube';
  }
}

// Save Discogs token
async function saveDiscogsToken() {
  const token = elements.discogsTokenInput.value.trim();

  if (!token) {
    alert('Please enter a token');
    return;
  }

  if (!isValidDiscogsToken(token)) {
    alert('That doesn\'t look like a valid Discogs token. Please copy it directly from your Discogs developer settings.');
    return;
  }
  
  // Save token
  await chrome.storage.local.set({ discogsToken: token });
  await updateAuthStatus();
  
  elements.discogsTokenInput.value = '';
  alert('Discogs token saved!');
}

// Save YouTube Client ID
async function saveYoutubeClientId() {
  const clientId = elements.youtubeClientIdInput.value.trim();

  if (!clientId) {
    alert('Please enter a YouTube Client ID');
    return;
  }

  if (!isValidYouTubeClientId(clientId)) {
    alert('That doesn\'t look like a valid Client ID. It should end in .apps.googleusercontent.com');
    return;
  }

  await chrome.storage.local.set({ youtubeClientId: clientId });
  await updateAuthStatus();

  elements.youtubeClientIdInput.value = '';
  elements.saveYoutubeClientIdBtn.disabled = true;
  alert('YouTube Client ID saved!');
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function showSetup() {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens.setup.classList.remove('hidden');
}

function isValidYouTubeClientId(id) {
  return /^[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(id);
}

function isValidDiscogsToken(token) {
  return /^[a-zA-Z0-9]{15,}$/.test(token);
}

// ── End Setup ─────────────────────────────────────────────────────────────────

// Show/hide views
function showView(viewName) {
  // Hide all views
  Object.values(views).forEach(view => view.classList.add('hidden'));
  
  // Show requested view
  if (views[viewName]) {
    views[viewName].classList.remove('hidden');
  }
}

// Show error
function showError(message) {
  elements.errorMessage.textContent = message;
  screens.main.classList.add('hidden');
  screens.error.classList.remove('hidden');
}

// Show settings
function showSettings() {
  screens.main.classList.add('hidden');
  screens.settings.classList.remove('hidden');
  updateAuthStatus();
}

// Hide settings
function hideSettings() {
  screens.settings.classList.add('hidden');
  screens.main.classList.remove('hidden');
}

// Setup event listeners
function setupEventListeners() {
  // Main buttons
  elements.startBtn?.addEventListener('click', startExtraction);
  elements.cancelBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'cancelExtraction' });
    showView('detection');
  });
  elements.openPlaylistBtn?.addEventListener('click', openYouTubePlaylist);
  elements.newSessionBtn?.addEventListener('click', () => {
    showView('detection');
    detectRecords();
  });
  elements.downloadLogBtn?.addEventListener('click', downloadLog);
  elements.openLogViewerBtn?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('log-viewer.html');
    chrome.tabs.create({ url });
  });
  // Setup screen
  document.getElementById('open-setup-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
  });

  // Settings buttons
  elements.openSettingsBtn?.addEventListener('click', showSettings);
  elements.closeSettingsBtn?.addEventListener('click', hideSettings);
  elements.connectYouTubeBtn?.addEventListener('click', connectYouTube);
  elements.youtubeClientIdInput?.addEventListener('input', () => {
    elements.saveYoutubeClientIdBtn.disabled = !elements.youtubeClientIdInput.value.trim();
  });
  elements.saveYoutubeClientIdBtn?.addEventListener('click', saveYoutubeClientId);
  elements.saveDiscogsTokenBtn?.addEventListener('click', saveDiscogsToken);

  
  // Error buttons
  elements.retryBtn?.addEventListener('click', () => {
    screens.error.classList.add('hidden');
    screens.main.classList.remove('hidden');
    detectRecords();
  });
  elements.downloadLogErrorBtn?.addEventListener('click', downloadLog);
  elements.backBtn?.addEventListener('click', () => {
    screens.error.classList.add('hidden');
    screens.main.classList.remove('hidden');
  });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
