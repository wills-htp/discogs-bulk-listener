# Discogs Bulk Listener - Installation Guide

> This extension is meant to help people find records to buy. Please support artists, labels, and the music-loving community by buying records. It's fun.

## What You'll Need
- Chrome browser
- Google account (for YouTube API)
- Discogs account (free personal access token)

---

## Step 1: Get Your YouTube API Key (5 minutes)

### 1.1 Create a Google Cloud Project
1. Go to: https://console.cloud.google.com/
2. Click **"Select a project"** → **"New Project"**
3. Name it: "Discogs Listener" (or whatever you want)
4. Click **"Create"**

### 1.2 Enable YouTube Data API
1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search for: **"YouTube Data API v3"**
3. Click on it → Click **"Enable"**

### 1.3 Create API Key
1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"API Key"**
3. Copy the API key (looks like: `AIzaSyD...`)
4. **Save this somewhere safe!**

### 1.4 Create OAuth Client ID
1. Still in **"Credentials"**, click **"Create Credentials"** → **"OAuth client ID"**
2. If prompted to configure consent screen:
   - Click **"Configure Consent Screen"**
   - Choose **"External"** → **"Create"**
   - Fill in:
     - App name: "Discogs Listener"
     - User support email: (your email)
     - Developer contact: (your email)
   - Click **"Save and Continue"** through all screens
   - On "Test users" page, click **"Add Users"** and add your own email
   - Click **"Save and Continue"** → **"Back to Dashboard"**

3. Now create the OAuth client:
   - Application type: **"Web application"**
   - Name: "Discogs Listener Web"
   - **Authorized redirect URIs:** Leave blank for now (we'll add it later)
   - Click **"Create"**
   - Copy the **Client ID** (looks like: `1061683689117-abc123...apps.googleusercontent.com`)
   - **Save this somewhere safe!**

---

## Step 2: Get Your Discogs Token (2 minutes)

1. Go to: https://www.discogs.com/settings/developers
2. Click **"Generate new token"**
3. Name it: "Bulk Listener"
4. Copy the token (looks like: `dfjcjwbaGcMyfSdsRs...`)
5. **Save this somewhere safe!**

---

## Step 3: Install the Extension (2 minutes)

1. Download the `discogs-bulk-listener.zip` file
2. Extract it to a folder (remember where!)
3. Open Chrome and go to: `chrome://extensions/`
4. Toggle **"Developer mode"** ON (top right)
5. Click **"Load unpacked"**
6. Select the folder you extracted

**IMPORTANT:** Copy the **Extension ID** shown under the extension name (looks like: `bdhfmegodpphmmphhjenpkjjfcfegoni`)

---

## Step 4: Configure OAuth Redirect

Before connecting, you need to add your extension's redirect URI to Google Cloud Console.

1. Go back to Google Cloud Console: https://console.cloud.google.com/
2. Go to **"APIs & Services"** → **"Credentials"**
3. Click on your **OAuth 2.0 Client ID** (the one you created in Step 1.4)
4. Under **"Authorized redirect URIs"**, click **"Add URI"**
5. Enter: `https://YOUR_EXTENSION_ID.chromiumapp.org/`
   - Replace `YOUR_EXTENSION_ID` with the Extension ID from Step 3
   - Example: `https://bdhfmegodpphmmphhjenpkjjfcfegoni.chromiumapp.org/`
6. Click **"Save"**

---

## Step 5: Enter Your Credentials

Click the extension icon — a **setup wizard** will open automatically:

1. **Step 1** — Paste your **YouTube OAuth Client ID** (from Step 1.4)
2. **Step 2** — Paste your **Discogs Personal Access Token** (from Step 2)
3. **Step 3** — Click **"Connect YouTube"** → Approve permissions in the browser window that opens

No code editing required. You can update any credential later via ⚙️ Settings.

---

## You're Done! 🎉

This extension is meant to help people find records to buy. Please support artists, labels, and the music-loving community by buying records. It's fun.

Go to any Discogs seller page (like: https://www.discogs.com/seller/MicroVinyl/profile) and click the extension icon to start creating playlists!

---

## Understanding Quota Limits

**Important:** YouTube gives you 10,000 quota units per day:
- Creating a playlist: 50 units
- Adding each video: 50 units
- **Total: You can add about 200 videos per day**

If you try to add more than 200 videos in one day:
- The first ~200 will be added successfully
- The rest will fail with "quota exceeded"
- Your quota resets at midnight Pacific Time

**Tips:**
- Keep extractions under 30-35 records to stay under 200 videos
- If you need more, split across multiple days
- Or apply for a quota increase at: https://console.cloud.google.com/ (takes weeks)

---

## Troubleshooting

**"YouTube authentication expired"**
- Click Settings → Connect YouTube again

**"Quota exceeded"**
- You've used your 10,000 daily quota
- Wait until midnight Pacific Time for reset
- Or reduce the number of records you're extracting

**Extension icon says "invalid request"**
- Your OAuth redirect URI is wrong
- Make sure it exactly matches: `https://YOUR_EXTENSION_ID.chromiumapp.org/`
- Extension ID changes if you remove/reinstall the extension

> This extension is meant to help people find records to buy. Please support artists, labels, and the music-loving community by buying records. It's fun.

**Need help?**
- Check the background console: `chrome://extensions/` → click "service worker"
- All errors and logs appear there
