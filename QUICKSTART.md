# 🚀 Quick Start Guide

## What You Need (5 minutes setup)

1. **YouTube API Key** (free)
2. **Discogs Personal Access Token** (free)

## Setup Steps

### 1. Get YouTube API Key (2 minutes)

1. Go to https://console.cloud.google.com/
2. Create new project → Enable "YouTube Data API v3"
3. Create Credentials → API Key → Copy it
4. Create OAuth Client → Type: Chrome Extension → Copy Client ID

### 2. Get Discogs Token (1 minute)

1. Go to https://www.discogs.com/settings/developers
2. Generate new token → Copy it

### 3. Install Extension (2 minutes)

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → Select the folder
4. Copy the Extension ID

5. Go back to Google Cloud Console
6. Edit OAuth Client → Add redirect URI:
   `https://[YOUR_EXTENSION_ID].chromiumapp.org/`

### 4. Enter Your Credentials

Click the extension icon — a setup wizard will appear automatically:

1. **Step 1** — Paste your YouTube OAuth Client ID
2. **Step 2** — Paste your Discogs Personal Access Token
3. **Step 3** — Click "Connect YouTube" and approve permissions

## You're Done! 🎉

Now go to any Discogs seller page, filter the records, and click "Create Listening Session"!

## Example Workflow

1. Navigate to: `discogs.com/seller/TechnoMart/profile`
2. Filter: Genre = "Techno", Price = $5-$15
3. Click extension → "Create Listening Session"
4. Wait 2-3 minutes (100 records)
5. Listening interface opens
6. Listen → Click "Add to Cart" for good ones
7. Go to Discogs cart → Checkout!

---

For detailed troubleshooting, see the full README.md
