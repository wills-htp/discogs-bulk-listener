// Setup page script

function isValidYouTubeClientId(id) {
  return /^[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(id);
}

function isValidDiscogsToken(token) {
  return /^[a-zA-Z0-9]{15,}$/.test(token);
}

function showStatus(id, message, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = 'status-msg ' + type;
}

function updateProgress(hasClientId, hasDiscogs, hasYouTube) {
  if (hasClientId) document.getElementById('prog-cloud')?.classList.add('done');
  if (hasDiscogs)  document.getElementById('prog-discogs')?.classList.add('done');
  if (hasYouTube)  document.getElementById('prog-connect')?.classList.add('done');
}

function markStepDone(stepId) {
  const el = document.getElementById(stepId);
  if (el) el.classList.add('done');
}

async function checkCompletion() {
  const { youtubeClientId, discogsToken, youtubeAccessToken } = await chrome.storage.local.get([
    'youtubeClientId', 'discogsToken', 'youtubeAccessToken'
  ]);
  updateProgress(!!youtubeClientId, !!discogsToken, !!youtubeAccessToken);
  if (youtubeClientId && discogsToken && youtubeAccessToken) {
    const el = document.getElementById('setup-complete');
    if (el) {
      el.classList.remove('hidden');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

async function init() {
  // Display redirect URI
  const redirectUri = chrome.identity.getRedirectURL().replace(/\/$/, '');
  const redirectEl = document.getElementById('redirect-uri-display');
  if (redirectEl) redirectEl.textContent = redirectUri;

  const copyBtn = document.getElementById('copy-redirect-uri-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(redirectUri).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });
  }

  // Check existing credentials and pre-fill status
  const { youtubeClientId, discogsToken, youtubeAccessToken } = await chrome.storage.local.get([
    'youtubeClientId', 'discogsToken', 'youtubeAccessToken'
  ]);

  if (youtubeClientId) {
    document.getElementById('client-id-saved-banner').textContent = '✓ Client ID already saved';
    markStepDone('stepnum-5');
  }

  if (discogsToken) {
    document.getElementById('discogs-saved-banner').textContent = '✓ Discogs token already saved';
    markStepDone('stepnum-6');
  }

  if (youtubeAccessToken) {
    showStatus('connect-status', '✓ YouTube account already connected', 'success');
    const btn = document.getElementById('connect-youtube-btn');
    if (btn) { btn.textContent = '✓ Connected'; btn.disabled = true; }
    markStepDone('stepnum-7');
  }

  updateProgress(!!youtubeClientId, !!discogsToken, !!youtubeAccessToken);

  if (youtubeClientId && discogsToken && youtubeAccessToken) {
    document.getElementById('setup-complete')?.classList.remove('hidden');
  }

  // ── Client ID ──
  const clientIdInput = document.getElementById('client-id-input');
  const saveClientIdBtn = document.getElementById('save-client-id-btn');

  clientIdInput?.addEventListener('input', () => {
    saveClientIdBtn.disabled = !clientIdInput.value.trim();
  });

  saveClientIdBtn?.addEventListener('click', async () => {
    const clientId = clientIdInput.value.trim();
    if (!isValidYouTubeClientId(clientId)) {
      showStatus('client-id-status', 'Invalid Client ID — it should end in .apps.googleusercontent.com', 'error');
      return;
    }
    await chrome.storage.local.set({ youtubeClientId: clientId });
    clientIdInput.value = '';
    saveClientIdBtn.disabled = true;
    showStatus('client-id-status', '✓ Client ID saved — continue to Part 2 below', 'success');
    document.getElementById('client-id-saved-banner').textContent = '✓ Client ID saved';
    markStepDone('stepnum-5');
    checkCompletion();
  });

  // ── Discogs token ──
  const discogsInput = document.getElementById('discogs-token-input');
  const saveDiscogsBtn = document.getElementById('save-discogs-token-btn');

  discogsInput?.addEventListener('input', () => {
    saveDiscogsBtn.disabled = !discogsInput.value.trim();
  });

  saveDiscogsBtn?.addEventListener('click', async () => {
    const token = discogsInput.value.trim();
    if (!isValidDiscogsToken(token)) {
      showStatus('discogs-token-status', 'Invalid token — paste it directly from Discogs settings', 'error');
      return;
    }
    await chrome.storage.local.set({ discogsToken: token });
    discogsInput.value = '';
    saveDiscogsBtn.disabled = true;
    showStatus('discogs-token-status', '✓ Discogs token saved — continue to Part 3 below', 'success');
    document.getElementById('discogs-saved-banner').textContent = '✓ Discogs token saved';
    markStepDone('stepnum-6');
    checkCompletion();
  });

  // ── Connect YouTube ──
  const connectBtn = document.getElementById('connect-youtube-btn');
  connectBtn?.addEventListener('click', async () => {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    try {
      const response = await chrome.runtime.sendMessage({ action: 'authenticateYouTube' });
      if (response.success) {
        showStatus('connect-status', '✓ YouTube connected — setup complete!', 'success');
        connectBtn.textContent = '✓ Connected';
        markStepDone('stepnum-7');
        checkCompletion();
      } else {
        showStatus('connect-status', 'Failed: ' + response.error, 'error');
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect YouTube →';
      }
    } catch (error) {
      showStatus('connect-status', 'Error: ' + error.message, 'error');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect YouTube →';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
