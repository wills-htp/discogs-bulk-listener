// Log viewer script
let logData = null;

// Load log on page load
async function loadLog() {
  try {
    const result = await chrome.storage.local.get('lastExtractionLog');
    logData = result.lastExtractionLog;

    if (!logData) {
      document.getElementById('log-content').textContent = 'No extraction log found. Complete an extraction first.';
      return;
    }

    // Show stats
    document.getElementById('stats-section').style.display = 'block';
    document.getElementById('stat-records').textContent = logData.session.totalRecords;
    document.getElementById('stat-videos').textContent = logData.session.videosFound;
    document.getElementById('stat-skipped').textContent = logData.session.videosSkipped;

    // Display log
    document.getElementById('log-content').textContent = logData.logText;
  } catch (error) {
    document.getElementById('log-content').textContent = 'Error loading log: ' + error.message;
    console.error('Error loading log:', error);
  }
}

function downloadTxt() {
  if (!logData) {
    alert('No log data available');
    return;
  }

  const blob = new Blob([logData.logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `extraction-log-${logData.timestamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadJson() {
  if (!logData) {
    alert('No log data available');
    return;
  }

  const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `extraction-log-${logData.timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copyToClipboard() {
  if (!logData) {
    alert('No log data available');
    return;
  }

  try {
    await navigator.clipboard.writeText(logData.logText);
    alert('Log copied to clipboard!');
  } catch (error) {
    alert('Failed to copy to clipboard: ' + error.message);
  }
}

// Load log when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadLog();
  
  // Add button event listeners
  document.getElementById('download-txt-btn')?.addEventListener('click', downloadTxt);
  document.getElementById('download-json-btn')?.addEventListener('click', downloadJson);
  document.getElementById('copy-clipboard-btn')?.addEventListener('click', copyToClipboard);
});
