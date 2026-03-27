# Discogs Bulk Listener — Handoff Document

## Memory & Resuming Sessions

- Memory directory: `/Users/will/.claude/projects/-Applications-discogs-bulk-listener/memory/`
- To resume: open Claude in `/Applications/discogs-bulk-listener` and say "load handoff"
- Claude will find this file automatically via memory

---

## What This Is

A Chrome extension for record collectors. Navigate to a Discogs seller, label, or artist page, click the extension, and it scrapes the releases, opens each one to find YouTube video IDs, creates a private YouTube playlist, and opens a listening interface where you can add records to your cart or wantlist while listening.

---

## Current State

The extension is feature-complete and working. It has passed a full security and robustness review. All console.log/error calls have been stripped from all scripts including `interface.js`. It is ready for Chrome Web Store submission pending a hosted privacy policy URL.

**Next immediate action:** Create a real-name GitHub account, push the repo there, set up GitHub Pages for the site (privacy policy, changelog, landing page) and use GitHub Issues for user feedback. This replaces the need for any separate hosting tool.

---

## File Structure

```
discogs-bulk-listener/
├── manifest.json              # Extension config (MV3)
├── popup.html                 # Extension popup UI
├── popup.css                  # Popup styles
├── log-viewer.html            # Standalone log viewer page
├── icons/                     # icon16, icon48, icon128 (vinyl record icon)
├── scripts/
│   ├── background.js          # Service worker — extraction, YouTube API, quota tracking, state
│   ├── content.js             # Runs on Discogs pages — scrapes releases
│   ├── popup.js               # Popup logic and UI coordination
│   └── log-viewer.js          # Log viewer page logic
└── interface/
    ├── index.html             # Listening interface (split-screen player)
    ├── interface.css
    └── interface.js           # YouTube player sync + Discogs cart/wantlist
```

---

## Supported Page Types

The content script is injected on three URL patterns:

| Page Type | URL Pattern | What Gets Scraped |
|-----------|-------------|-------------------|
| Seller | `discogs.com/seller/*/profile` | Listings with price, condition, format |
| Label | `discogs.com/label/*` | All releases on the label |
| Artist | `discogs.com/artist/*` | All releases in the discography (masters skipped) |

The popup auto-detects the page type and highlights the active one in the UI.

---

## Credentials & Storage

All credentials are stored in `chrome.storage.local` (Chrome-encrypted). Nothing is hardcoded.

| Key | What It Is | How It Gets Set |
|-----|------------|-----------------|
| `youtubeClientId` | OAuth 2.0 Client ID | Setup wizard (step 1) or Settings screen |
| `discogsToken` | Discogs Personal Access Token | Setup wizard (step 2) or Settings screen |
| `youtubeAccessToken` | OAuth bearer token | YouTube OAuth flow (setup step 3 or Settings) |
| `quotaDate` | Pacific-timezone date string | Auto-managed by quota tracker |
| `quotaUsed` | Cumulative units used today | Auto-managed by quota tracker |

On first install, if `youtubeClientId` is not set, the popup shows a 3-step setup wizard. After setup, normal operation resumes.

**To get credentials:**
- YouTube Client ID: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID
- Discogs token: discogs.com/settings/developers → Generate new token

---

## How Extraction Works

1. **Content script** (`content.js`) scrapes the current page and returns a list of records with Discogs release URLs.
2. **Popup** (`popup.js`) optionally collects records across all paginated pages, then sends a `startFullExtraction` message to the background.
3. **Background** (`background.js`) opens each release URL in a single minimised background window (hidden from the user), waits 5 seconds for the page to render, extracts YouTube video IDs from `i.ytimg.com` thumbnail URLs in the DOM (falls back to iframe src parsing), closes the tab, and moves to the next record with a 2-second delay. The background window is always closed in a `finally` block.
4. After all records are processed, background calls the YouTube API to create a private playlist and adds all video IDs to it (exponential backoff retry on failures). Each successful video add increments the local quota counter.
5. Background sends `extractionComplete` back to the popup with the playlist URL and full record data.

---

## YouTube Token Handling

`ensureValidToken()` in `background.js`:
- Tests the stored token against the YouTube API
- If expired, attempts a **silent** refresh via `launchAuthFlow(false)`
- If silent refresh fails, throws immediately with `'YouTube authentication expired. Please reconnect in Settings.'` — does NOT fall back to interactive OAuth
- Interactive OAuth only happens from Settings / setup wizard (user-initiated, expected to close popup)

**Why no interactive fallback:** `launchWebAuthFlow` opens a browser window which causes Chrome to close the extension popup. If this happened mid-extraction, users would lose visibility of the running process and start duplicate extractions.

---

## Popup State Restoration

`init()` in `popup.js` checks `getExtractionState` from the background before doing anything else. If extraction is already running (e.g. popup was closed and reopened), it jumps straight to the extraction view and hooks up the progress listener — preventing duplicate extractions from users who reopen and see a blank detection screen.

`startProgressListener()` has a `progressListenerActive` guard to prevent duplicate listeners accumulating across open/close cycles. The listener removes itself on `extractionComplete`.

---

## YouTube Quota Tracking

Quota resets at midnight Pacific Time. The extension tracks this locally.

| Constant | Value |
|----------|-------|
| `QUOTA_DAILY_LIMIT` | 10,000 units |
| `QUOTA_PLAYLIST_COST` | 50 units |
| `QUOTA_VIDEO_COST` | 50 units |
| Effective video limit | ~199 videos/day |

Functions in `background.js`:
- `getPacificDateString()` — current date in Pacific TZ
- `getQuotaState()` — reads from storage, auto-resets on new day
- `incrementQuota(units)` — called after playlist create and each successful video add
- `getRemainingVideos()` — returns `Math.floor(remaining / 50)`

The popup fetches remaining quota on init via `getQuotaRemaining` message and displays it below the START/STOP button as `~ N videos remaining (since last reset)`. Turns dark orange when under 50 remaining. Note: the counter starts at 0 on first install — it only tracks usage made through the extension from that point forward.

---

## UI Theme

Technics SL-1200 silver turntable aesthetic.

- Body background: `#c8cacc` (silver aluminium)
- Header: `linear-gradient(180deg, #b8bbbe 0%, #a8aaac 100%)`
- START/STOP button: silver surface, green LED when enabled
- BUY RECORDS sticker: yellow circle (`#f5d800`), rotated 5°, white-label style typography
- Progress bar: pitch-track slider with white cursor line and tick marks
- LOGS / SETTINGS: full-width silver raised buttons in footer

---

## Artist Page DOM Notes

Discogs artist pages do **not** use `data-release-id` on table rows (unlike label pages). The correct approach:

- Query `a[href*="/release/"]` — master rows only contain `/master/` links, so this naturally excludes masters
- Get each link's closest `tr` container
- Title is in `td[class*="title"]` as `"Artist1, Artist2 – Title"` (en-dash U+2013) — split on ` – ` to isolate the title
- Year is in `td[class*="year"]`
- Class names on `tr` and `td` elements contain CSS module hashes (e.g. `textWithCoversRow_Xv0h3`) that can change between Discogs deploys — do not rely on them

---

## Known Limitations

- **YouTube quota**: ~199 videos/day. Quota resets at midnight Pacific Time.
- **Quota counter cold start**: Counter starts at 0 on first install; doesn't know about API calls made before tracking was added.
- **Rate limiting**: 2-second delay between release pages + 5-second wait for page render. 100 records ≈ 12 minutes.
- **Mixes/podcasts**: Releases like RA mixes or XLR8R podcasts won't have embedded YouTube videos and will be skipped.
- **Artist page format**: Format column is not available in the artist page table — all artist releases show `format: "Unknown"`. Format is extracted from individual release pages for seller/label pages.
- **Discogs Cloudflare protection**: The page is behind Cloudflare and cannot be fetched headlessly. Selectors must be verified by running JS in the browser console directly.
- **Extension reload bug (mitigated)**: Reloading the extension in chrome://extensions kills content scripts in open tabs. Fixed: popup now auto-reinjects `content.js` on connection error and retries silently.
- **Pagination tab navigation**: `collectRecordsFromAllPages()` navigates the user's current tab through each page to collect records. The tab is left on the last page when done. This runs in the popup (not background), so if the popup closes mid-pagination the process stops and extraction never starts.

---

## Security & Robustness (Completed)

- All credentials removed from source code, stored in encrypted Chrome storage
- XSS: no `innerHTML` for user/API-derived content anywhere
- Sender validation: `if (sender.id !== chrome.runtime.id) return;` in message handler
- Input validation: `isValidYouTubeClientId()` and `isValidDiscogsToken()` on all credential inputs
- Background extraction window always closed in `finally` block
- Release tabs always closed in inner `finally` block
- YouTube token silent-refresh only during extraction; interactive re-auth only from Settings
- Exponential backoff retry on playlist video adds
- All `console.log` / `console.error` calls removed from all scripts (including interface.js)
- Manifest host_permissions narrowed to exact required domains
- Playlist name sanitised: `baseName.replace(/[<>"']/g, '')`

---

## GitHub & Hosting Setup

- **This project uses the real-name GitHub account** — https://github.com/wills-htp — code, GitHub Pages, Issues
- **Pseudonym account**: separate account for other projects, must stay unlinked. Pseudonym Gmail suspension resolved (2026-03-22).
- **SSH:** Two separate SSH keys on this machine:
  - `~/.ssh/id_ed25519` → pseudonym account
  - `~/.ssh/id_ed25519_github_will` → real-name account
  - `~/.ssh/config` routes each key via `github.com` / `github-will` host aliases
- **Next steps:**
  1. Create real-name GitHub account (if not done)
  2. Add `~/.ssh/id_ed25519_github_will.pub` to it (GitHub → Settings → SSH keys)
  3. Create repo, push code, set up GitHub Pages

---

## Chrome Web Store Submission Checklist

- [x] Extension works end-to-end on seller, label, artist pages
- [x] Security pass complete
- [x] Console calls stripped (all scripts)
- [x] Manifest description user-facing
- [x] Privacy policy text drafted (saved in memory)
- [ ] Create real-name GitHub repo, push code, set up GitHub Pages
- [ ] Host privacy policy on GitHub Pages and add URL to store listing
- [ ] Prepare store listing assets: at least 1 screenshot (1280×800 or 640×400), short description, category (Music or Productivity)
- [ ] Submit at chrome.google.com/webstore/devconsole

---

## Potential Next Work

- **Spotify playlist support** — Spotify Web API offers similar playlist creation; would need a separate OAuth flow
- **Session history** — replay a previous listening session from the log
- **Multi-seller sessions** — combine records from multiple sellers into one playlist
- **Artist page format** — format is not in the table DOM but could be fetched from the Discogs API per-release if needed
- **Quota increase** — apply at Google Cloud Console; the process takes weeks and requires app verification
