# Discogs Bulk Listener - Chrome Extension

A Chrome extension that helps record collectors efficiently preview multiple records from a Discogs seller's inventory before making bulk purchases.

## 🎯 What It Does

1. **Extract Records**: Scrapes a Discogs seller's filtered inventory page to get all record listings
2. **Find Videos**: Opens each record page to extract YouTube video links (respects rate limiting)
3. **Create Playlist**: Generates a private YouTube playlist with all found videos
4. **Interactive Listening**: Provides a split-screen interface where you can:
   - Watch/listen to the YouTube playlist
   - See synchronized record details (artist, title, price, condition)
   - Add records to your Discogs cart or wantlist while listening
   - Track which records you've added

## 📋 Prerequisites

Before installing, you'll need:

1. **Google Account** (for YouTube API)
2. **Discogs Account** (obviously!)
3. **Chrome Browser** (version 88+)

## 🔧 Setup Instructions

### Step 1: Get YouTube API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing one)
3. Enable the **YouTube Data API v3**:
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the API key (you'll need this)
5. Create OAuth 2.0 Client ID:
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Chrome Extension"
   - Add your extension ID (you'll get this after first install)
   - Copy the Client ID

### Step 2: Get Discogs Personal Access Token

1. Go to [Discogs Developer Settings](https://www.discogs.com/settings/developers)
2. Click "Generate new token"
3. Give it a name (e.g., "Bulk Listener")
4. Copy the token (keep it secret!)

### Step 3: Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `discogs-bulk-listener` folder
5. The extension should now appear in your extensions list
6. **Important**: Copy the Extension ID (it looks like: `abcdefghijklmnop...`)

### Step 4: Update OAuth Redirect URI

1. Go back to Google Cloud Console
2. Go to your OAuth 2.0 Client ID
3. Edit the redirect URI to include your extension ID:
   - Add: `https://YOUR_EXTENSION_ID.chromiumapp.org/`
   - Example: `https://abcdefghijklmnop.chromiumapp.org/`
4. Save changes

### Step 5: Connect Your Accounts

When you first click the extension icon, a setup wizard will guide you through entering your credentials — no code editing required:

1. **Step 1** — Paste your YouTube OAuth Client ID
2. **Step 2** — Paste your Discogs Personal Access Token
3. **Step 3** — Click "Connect YouTube" to complete the OAuth flow

You can update any credential later via the ⚙️ Settings screen.

## 🚀 How to Use

### Basic Workflow

1. **Navigate to a Discogs seller page**
   - Example: `https://www.discogs.com/seller/SellerName/profile`

2. **Filter the inventory**
   - Use Discogs built-in filters (genre, price range, format, etc.)
   - Example: Filter for "Techno" records between $5-$15

3. **Start extraction**
   - Click the extension icon
   - It will show how many records it found and detect pagination
   - If there are multiple pages (e.g., "1-25 of 500 records"):
     - Default: **"All pages"** (500 records) - comprehensive extraction
     - Optional: "Quick preview - Current page only" (25 records) - for testing/sampling
   - Click "Create Listening Session"

4. **Wait for extraction**
   - If you chose "All pages", it will first collect records from each page (~2 seconds per page)
   - Then it will open each record page to find videos (~1.5 seconds per record)
   - Progress bar shows current status
   - Total time estimate: (number of pages × 2s) + (number of records × 1.5s)
   - Example: 20 pages + 500 records = ~40s + ~12.5 minutes = ~13 minutes

5. **Listen and decide**
   - The listening interface will open automatically
   - Left side: YouTube playlist playing
   - Right side: Current record details
   - As you listen, click "Add to Cart" or "Add to Wantlist" for records you want

6. **Complete purchase**
   - When done, click "View Cart on Discogs"
   - Review your selections and checkout

### Tips

- **Filtering first is key**: The extension processes whatever is shown, so apply genre/price filters before extraction
- **All pages by default**: The extension will automatically extract from all pages - this is what you want for bulk buying
- **Quick preview option**: If you just want to test or sample a seller, use "Current page only" option (25 records, ~40 seconds)
- **Be patient with large inventories**: Extracting 500 records takes 10-15 minutes to avoid rate limiting - this is normal and necessary
- **Use Wantlist for "maybes"**: Add to cart only for definite purchases, use wantlist for records you want to consider later
- **Check "Up Next"**: You can see the next few records coming up while listening

## 📁 File Structure

```
discogs-bulk-listener/
├── manifest.json           # Extension configuration
├── popup.html             # Extension popup UI
├── popup.css              # Popup styles
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── scripts/
│   ├── background.js      # Service worker (extraction + API calls)
│   ├── content.js         # Runs on Discogs pages (scrapes records)
│   └── popup.js           # Popup logic
└── interface/
    ├── index.html         # Listening interface
    ├── interface.css      # Interface styles
    └── interface.js       # Player sync + Discogs integration
```

## 🔒 Privacy & Security

- **Your data never leaves your browser** except for API calls to YouTube and Discogs
- API credentials are stored in Chrome's encrypted storage
- YouTube playlists are private by default
- No analytics, tracking, or data collection
- All code is open for inspection

## 🐛 Troubleshooting

### "No records found"
- Make sure you're on a Discogs seller inventory page
- Check that the page has finished loading
- The URL should match: `discogs.com/seller/*/profile`

### "Failed to connect YouTube"
- Verify your API key and Client ID are correct
- Check that YouTube Data API v3 is enabled
- Ensure redirect URI matches your extension ID

### "Failed to add to cart"
- Verify your Discogs token is valid
- The item might already be in your cart
- The seller might have removed the listing
- Try opening the Discogs page directly (the extension provides a fallback)

### Extraction is slow
- This is normal! The extension respects rate limits
- 1.5 seconds per record = ~2.5 minutes for 100 records
- Don't close the extension popup while extracting

### "Some videos not found"
- Not all Discogs releases have YouTube videos
- The extension will skip these and show the count
- You can still see which were skipped in the progress indicator

## 🔄 Rate Limits

### YouTube API
- **Quota**: 10,000 units/day (shared among all users of your API key)
- **Creating playlist**: ~50 units
- **Adding video**: ~50 units each
- **Typical session**: 100 videos = ~5,050 units (you can do ~2 sessions/day)

### Discogs API
- **Authenticated**: 60 requests/minute
- **The extension**: 1-2 requests/second (well below limit)

## 🛠️ Development

### Testing Changes

1. Make your code changes
2. Go to `chrome://extensions/`
3. Click the refresh icon on your extension
4. Test functionality

### Debugging

- **Popup**: Right-click extension icon > "Inspect popup"
- **Background script**: Go to `chrome://extensions/` > "Inspect views: service worker"
- **Content script**: Open DevTools on Discogs page, check console
- **Interface**: Open DevTools on the listening interface tab

## 📝 Known Limitations

1. **Multi-page extraction takes time**: Extracting 500 records across 20 pages can take 10-15 minutes due to rate limiting
2. **No batch cart operations**: Discogs API requires adding items one at a time
3. **YouTube API quota**: Shared key limits total daily usage
4. **Desktop only**: Not available for mobile Chrome

## 🚧 Future Enhancements

Potential features for future versions:
- Automatic pagination handling
- Session history and replay
- Spotify playlist creation
- Multi-seller sessions
- Price tracking and alerts
- AI-powered recommendations based on listening

## 📄 License

This is a personal tool for you and friends. Not licensed for commercial use or public distribution.

## 🤝 Contributing

Since this is for personal use:
1. Make changes
2. Test thoroughly
3. Share with friends who use it
4. Document any new setup steps

## ❓ Questions?

- Check the console logs (F12) for detailed error messages
- Review the API documentation:
  - [YouTube Data API](https://developers.google.com/youtube/v3)
  - [Discogs API](https://www.discogs.com/developers)

---

**Version**: 1.0.0  
**Last Updated**: February 2026
