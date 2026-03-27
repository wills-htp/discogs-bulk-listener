# Label Page Support - Already Implemented! ✅

The extension **already supports label pages**! Here's how to use it:

## How to Use with Label Pages

1. **Navigate to any Discogs label page**
   - Example: https://www.discogs.com/label/768104-Time-Passages
   - Or any label page like: `https://www.discogs.com/label/XXXXX-LabelName`

2. **Click the extension icon**
   - It will automatically detect it's a label page
   - Shows: "Found X releases" instead of "Found X records"

3. **Choose extraction scope**
   - ⚫ **All pages** - Extracts ALL releases from the label (all pages)
   - ⚪ **Current page only** - Just the releases visible on current page

4. **Click "Create Listening Session"**
   - Extracts videos from all releases
   - Creates playlist named: **"Label Name (X records) - Date"**
   - Example: `Time Passages (45 records) - Feb 24, 2026`

## Differences from Seller Pages

### Seller Pages:
- Shows price, condition, format
- Playlist name includes filters: `Seller - House • $10-15 (25 records) - Date`

### Label Pages:
- No prices/conditions (just releases)
- Playlist name is simple: `Label Name (45 records) - Date`
- Includes all releases on the label

## What Gets Extracted

From each release on the label:
- ✅ Artist name
- ✅ Release title
- ✅ Format/year info
- ✅ Thumbnail
- ✅ ALL YouTube videos embedded on the release page

## Quota Limits (Same as Seller Pages)

- YouTube allows ~200 videos per day (10,000 quota units)
- If a label has 50 releases with 5 videos each = 250 videos
- First 200 will be added, rest will fail with "quota exceeded"
- Wait until midnight Pacific Time for quota reset

## Example Usage

**Small Label (Under 200 videos):**
```
URL: https://www.discogs.com/label/768104-Time-Passages
Releases: 45
Videos per release: ~4
Total videos: ~180
Result: ✅ Full playlist created successfully
```

**Large Label (Over 200 videos):**
```
URL: https://www.discogs.com/label/XXXXX-BigLabel  
Releases: 100
Videos per release: ~3
Total videos: ~300
Result: ⚠️ First ~200 added, remaining 100 fail (quota exceeded)
Solution: Extract in batches or wait 24 hours
```

## Tips

1. **Check release count before extracting**
   - The popup shows total releases and pages
   - Estimate: releases × 4 = approximate video count
   - Keep under 50 releases to stay under quota

2. **Multi-page labels**
   - Always choose "All pages" to get complete discography
   - Or extract page by page if quota is limited

3. **Combine with filters**
   - Some label pages have filters (format, year, etc.)
   - The extension will extract whatever releases are showing

## Known Limitations

1. **Master Releases**: Skipped (only specific release versions extracted)
2. **No Filters in Name**: Label playlist names don't include filters (unlike seller pages)
3. **Quota Limits**: Same 200 video/day limit applies

## Troubleshooting

**"No releases found"**
- Make sure you're on the "All Releases" tab of the label page
- Some label pages don't list releases properly - try a different view

**Only getting a few videos**
- Check if label page is actually showing all releases
- Some labels have 100s of releases - you might need multiple sessions

**Playlist name is "Unknown Label"**
- Label name detection failed
- The playlist will still work, just with generic name
- Report this issue with the label URL

## Already Works!

You don't need to do anything special - just:
1. Go to a label page
2. Click the extension
3. Click "Create Listening Session"

That's it! The extension handles everything automatically. 🎉
