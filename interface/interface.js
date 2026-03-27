// Listening Interface - handles YouTube player and record interactions

// State
let sessionData = null;
let currentRecordIndex = 0;
let cartItems = [];
let wantlistItems = [];
let playerIframe = null;

// Initialize
async function init() {
  // Load session data
  const result = await chrome.storage.local.get('currentSession');
  sessionData = result.currentSession;
  
  if (!sessionData) {
    showError('No session data found');
    return;
  }
  
  // Filter records and count videos
  let totalVideos = 0;
  sessionData.records.forEach(r => {
    if (r.videoIds && Array.isArray(r.videoIds)) {
      totalVideos += r.videoIds.length;
    } else if (r.videoId) {
      totalVideos += 1;
    }
  });
  
  if (totalVideos === 0) {
    showError('No videos found in session');
    return;
  }
  
  // Update playlist info
  document.getElementById('total-videos').textContent = totalVideos;
  document.getElementById('total-records').textContent = sessionData.records.length;
  document.getElementById('open-playlist-btn').href = sessionData.playlistUrl;
  
  // Update session info in header
  updateSessionInfo();
  
  // Show current record and list
  updateCurrentRecord(0);
  renderUpNextList();
  
  // Set up event listeners
  setupEventListeners();
  
  // Hide loading overlay
  document.getElementById('loading-overlay').classList.add('hidden');
}

// Update current record display
function updateCurrentRecord(index) {
  if (index < 0 || index >= sessionData.records.length) return;
  
  currentRecordIndex = index;
  const record = sessionData.records[index];
  
  // Helper to safely set text content
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '--';
  }

  function setHref(id, value) {
    const el = document.getElementById(id);
    if (el) el.href = value || '#';
  }

  function setSrc(id, value, alt) {
    const el = document.getElementById(id);
    if (el) {
      el.src = value || '';
      if (alt) el.alt = alt;
    }
  }
  
  // Update thumbnail
  setSrc('current-thumbnail', record.thumbnail, `${record.artist} - ${record.title}`);
  
  // Update text
  setText('current-artist', record.artist || 'Unknown Artist');
  setText('current-title', record.title || 'Unknown Title');
  setText('current-price', record.price);
  setText('current-condition', record.condition);
  setText('current-format', record.format);
  
  // Update Discogs link
  setHref('view-discogs-btn', record.discogsUrl);
  
  // Update button states
  updateButtonStates(record);
  
  // Highlight in list
  highlightCurrentInList(index);
}

// Update button states based on record status
function updateButtonStates(record) {
  const cartBtn = document.getElementById('add-cart-btn');
  const wantlistBtn = document.getElementById('add-wantlist-btn');
  
  if (record.status.inCart) {
    cartBtn.textContent = '✓ In Cart';
    cartBtn.classList.add('added');
    cartBtn.disabled = true;
  } else {
    cartBtn.innerHTML = '<span class="btn-icon">🛒</span> Add to Cart';
    cartBtn.classList.remove('added');
    cartBtn.disabled = false;
  }
  
  if (record.status.inWantlist) {
    wantlistBtn.textContent = '✓ In Wantlist';
    wantlistBtn.classList.add('added');
    wantlistBtn.disabled = true;
  } else {
    wantlistBtn.innerHTML = '<span class="btn-icon">🤍</span> Add to Wantlist';
    wantlistBtn.classList.remove('added');
    wantlistBtn.disabled = false;
  }
}

// Highlight current record in list
function highlightCurrentInList(index) {
  const items = document.querySelectorAll('.record-list-item');
  items.forEach((item, i) => {
    if (i === index) {
      item.classList.add('current');
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      item.classList.remove('current');
    }
  });
}

// Render up next list (show next 5)
function renderUpNextList() {
  const container = document.getElementById('up-next-list');
  container.innerHTML = '';
  
  const startIndex = Math.min(currentRecordIndex + 1, sessionData.records.length - 1);
  const endIndex = Math.min(startIndex + 5, sessionData.records.length);
  
  for (let i = startIndex; i < endIndex; i++) {
    const item = createRecordListItem(sessionData.records[i], i);
    container.appendChild(item);
  }
}

// Create record list item element
function createRecordListItem(record, index) {
  const div = document.createElement('div');
  div.className = 'record-list-item';
  div.dataset.index = index;
  
  // Thumbnail
  const thumb = document.createElement('div');
  thumb.className = 'record-list-item-thumb';
  const img = document.createElement('img');
  img.src = record.thumbnail || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"%3E%3Crect fill="%23e9ecef" width="50" height="50"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%236c757d" font-size="20"%3E♪%3C/text%3E%3C/svg%3E';
  thumb.appendChild(img);
  
  // Info
  const info = document.createElement('div');
  info.className = 'record-list-item-info';
  const artist = document.createElement('div');
  artist.className = 'record-list-item-artist';
  artist.textContent = record.artist || 'Unknown Artist';
  const title = document.createElement('div');
  title.className = 'record-list-item-title';
  title.textContent = record.title || 'Unknown Title';
  info.appendChild(artist);
  info.appendChild(title);
  
  // Price
  const price = document.createElement('div');
  price.className = 'record-list-item-price';
  price.textContent = record.price || '--';
  
  // Status badges
  const status = document.createElement('div');
  status.className = 'record-list-item-status';
  
  if (record.status.inCart) {
    const badge = document.createElement('span');
    badge.className = 'status-badge in-cart';
    badge.textContent = '🛒';
    badge.title = 'In Cart';
    status.appendChild(badge);
  }
  
  if (record.status.inWantlist) {
    const badge = document.createElement('span');
    badge.className = 'status-badge in-wantlist';
    badge.textContent = '🤍';
    badge.title = 'In Wantlist';
    status.appendChild(badge);
  }
  
  div.appendChild(thumb);
  div.appendChild(info);
  div.appendChild(price);
  div.appendChild(status);
  
  // Click to view record details
  div.addEventListener('click', () => {
    updateCurrentRecord(index);
  });
  
  return div;
}

// Update session info
function updateSessionInfo() {
  const date = new Date(sessionData.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  // Count total videos
  let totalVideos = 0;
  sessionData.records.forEach(r => {
    if (r.videoIds && Array.isArray(r.videoIds)) {
      totalVideos += r.videoIds.length;
    } else if (r.videoId) {
      totalVideos += 1;
    }
  });
  
  document.getElementById('session-info').textContent = `Session: ${date} • ${totalVideos} videos from ${sessionData.records.length} records`;
}

// Add to cart
async function addToCart() {
  const record = sessionData.records[currentRecordIndex];
  
  try {
    // Get Discogs token
    const { discogsToken } = await chrome.storage.local.get('discogsToken');
    if (!discogsToken) {
      alert('Please set up your Discogs token in Settings');
      return;
    }
    
    // Call Discogs API
    const response = await fetch('https://api.discogs.com/marketplace/cart', {
      method: 'POST',
      headers: {
        'Authorization': `Discogs token=${discogsToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscogsBlkListener/1.0'
      },
      body: JSON.stringify({
        listing_id: record.listingId,
        quantity: 1
      })
    });
    
    if (response.ok) {
      record.status.inCart = true;
      cartItems.push(record);
      updateButtonStates(record);
      updateCartSummary();
      renderUpNextList(); // Refresh list to show badge
      showNotification('Added to cart!');
    } else {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add to cart');
    }
  } catch (error) {
    alert('Failed to add to cart. Opening Discogs page instead.');
    window.open(record.discogsUrl, '_blank');
  }
}

// Add to wantlist
async function addToWantlist() {
  const record = sessionData.records[currentRecordIndex];
  
  try {
    // Get Discogs token
    const { discogsToken } = await chrome.storage.local.get('discogsToken');
    if (!discogsToken) {
      alert('Please set up your Discogs token in Settings');
      return;
    }
    
    // Call Discogs API
    const response = await fetch(`https://api.discogs.com/users/me/wants/${record.releaseId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Discogs token=${discogsToken}`,
        'User-Agent': 'DiscogsBlkListener/1.0'
      }
    });
    
    if (response.ok || response.status === 201) {
      record.status.inWantlist = true;
      wantlistItems.push(record);
      updateButtonStates(record);
      renderUpNextList(); // Refresh list to show badge
      showNotification('Added to wantlist!');
    } else {
      throw new Error('Failed to add to wantlist');
    }
  } catch (error) {
    alert('Failed to add to wantlist. Opening Discogs page instead.');
    window.open(record.discogsUrl, '_blank');
  }
}

// Update cart summary
function updateCartSummary() {
  document.getElementById('cart-count').textContent = cartItems.length;
  
  const total = cartItems.reduce((sum, record) => sum + record.priceValue, 0);
  document.getElementById('cart-total').textContent = `$${total.toFixed(2)}`;
}

// Update session info
function updateSessionInfo() {
  const date = new Date(sessionData.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  document.getElementById('session-info').textContent = `Session: ${date} • ${sessionData.records.length} tracks`;
}

// Show notification
function showNotification(message) {
  // Simple implementation - could be enhanced with a toast notification
}

// Show all records modal
function showAllRecordsModal() {
  const modal = document.getElementById('all-records-modal');
  modal.classList.remove('hidden');
  
  document.getElementById('modal-track-count').textContent = sessionData.records.length;
  renderAllRecordsList();
}

// Render all records list
function renderAllRecordsList() {
  const container = document.getElementById('all-records-list');
  container.innerHTML = '';
  
  sessionData.records.forEach((record, index) => {
    const item = createRecordListItem(record, index);
    container.appendChild(item);
  });
  
  highlightCurrentInList(currentRecordIndex);
}

// Setup event listeners
function setupEventListeners() {
  // Record actions
  document.getElementById('add-cart-btn')?.addEventListener('click', addToCart);
  document.getElementById('add-wantlist-btn')?.addEventListener('click', addToWantlist);
  
  // Header actions
  document.getElementById('view-cart-btn')?.addEventListener('click', () => {
    window.open('https://www.discogs.com/sell/cart', '_blank');
  });
  
  document.getElementById('end-session-btn')?.addEventListener('click', () => {
    if (confirm('End this listening session?')) {
      window.close();
    }
  });
  
  // Modal
  document.getElementById('toggle-all-btn')?.addEventListener('click', showAllRecordsModal);
  document.getElementById('close-modal-btn')?.addEventListener('click', () => {
    document.getElementById('all-records-modal').classList.add('hidden');
  });
  
  // Modal filter
  document.getElementById('filter-status')?.addEventListener('change', (e) => {
    // Filter records based on selection
    // TODO: Implement filtering
  });
}

// Show error — uses textContent only to prevent XSS
function showError(message) {
  const overlay = document.getElementById('loading-overlay');
  overlay.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'text-align:center';

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:60px;margin-bottom:20px';
  icon.textContent = '⚠️';

  const heading = document.createElement('h2');
  heading.style.cssText = 'margin-bottom:10px';
  heading.textContent = 'Error';

  const text = document.createElement('p');
  text.style.cssText = 'color:#6c757d';
  text.textContent = message;

  wrapper.appendChild(icon);
  wrapper.appendChild(heading);
  wrapper.appendChild(text);
  overlay.appendChild(wrapper);
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
