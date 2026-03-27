// Content script that runs on Discogs seller and label pages
// Detects records/releases on the page and prepares data for extraction

(function() {
  'use strict';

  // Detect page type
  function getPageType() {
    const url = window.location.href;
    if (url.includes('/seller/') && url.includes('/profile')) {
      return 'seller';
    } else if (url.includes('/label/')) {
      return 'label';
    } else if (url.includes('/artist/')) {
      return 'artist';
    }
    return 'unknown';
  }

  // Get label name from label page
  function getLabelName() {
    const h1 = document.querySelector('h1');
    if (h1) {
      return h1.textContent.trim();
    }
    const match = window.location.pathname.match(/\/label\/\d+-(.+)/);
    return match ? match[1].replace(/-/g, ' ') : 'Unknown Label';
  }

  // Get artist name from artist page
  function getArtistName() {
    const h1 = document.querySelector('h1');
    if (h1) {
      return h1.textContent.trim();
    }
    const match = window.location.pathname.match(/\/artist\/\d+-(.+)/);
    return match ? decodeURIComponent(match[1].replace(/-/g, ' ')) : 'Unknown Artist';
  }

  // Detect pagination info
  function getPaginationInfo() {
    // Look for pagination text like "1-25 of 500" or "1 – 25 of 500"
    const paginationText = document.querySelector('.pagination_total, .pagination_page_links');
    
    if (!paginationText) {
      return { currentPage: 1, totalPages: 1, totalRecords: 0 };
    }
    
    const text = paginationText.textContent;
    
    // Extract numbers from text - handle both hyphen and en-dash
    // Pattern matches: "1-25 of 500" or "1 – 25 of 500" or "Showing 1 - 25 of 500 items"
    const match = text.match(/(\d+)\s*[-–]\s*(\d+)\s*of\s*(\d+)/i);
    
    if (match) {
      const startRecord = parseInt(match[1]);
      const endRecord = parseInt(match[2]);
      const totalRecords = parseInt(match[3]);
      const recordsPerPage = endRecord - startRecord + 1;
      const totalPages = Math.ceil(totalRecords / recordsPerPage);
      const currentPage = Math.ceil(startRecord / recordsPerPage);
      
      return {
        currentPage,
        totalPages,
        totalRecords,
        recordsPerPage,
        startRecord,
        endRecord
      };
    }
    
    return { currentPage: 1, totalPages: 1, totalRecords: 0 };
  }

  // Get all page URLs for pagination
  function getAllPageUrls() {
    const paginationInfo = getPaginationInfo();
    if (paginationInfo.totalPages <= 1) {
      return [window.location.href];
    }
    
    // Get current URL and parse parameters
    const url = new URL(window.location.href);
    const urls = [];
    
    // Generate URL for each page
    for (let i = 1; i <= paginationInfo.totalPages; i++) {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set('page', i.toString());
      urls.push(pageUrl.href);
    }
    
    return urls;
  }

  // Extract record data from seller inventory page
  function extractRecordsFromPage() {
    const pageType = getPageType();

    if (pageType === 'seller') {
      return extractSellerRecords();
    } else if (pageType === 'label') {
      return extractLabelReleases();
    } else if (pageType === 'artist') {
      return extractArtistReleases();
    }

    return [];
  }
  
  // Extract releases from label page
  function extractLabelReleases() {
    const releases = [];
    const seenReleaseIds = new Set(); // Track which releases we've already extracted
    
    // Try multiple selectors for different label page layouts
    let items = document.querySelectorAll('tr[data-release-id]');
    
    if (items.length === 0) {
      // Try card layout
      items = document.querySelectorAll('.card');
    }
    
    if (items.length === 0) {
      // Try table rows with release links
      items = document.querySelectorAll('tr');
    }
    
    if (items.length === 0) {
      // Last resort: find any containers with release links
      const releaseLinks = document.querySelectorAll('a[href*="/release/"]');
      // Group links by their parent container
      const containers = new Set();
      releaseLinks.forEach(link => {
        const container = link.closest('tr, div, li');
        if (container) containers.add(container);
      });
      items = Array.from(containers);
    }
    
    items.forEach((item, index) => {
      try {
        // Find the release link
        const releaseLink = item.querySelector('a[href*="/release/"]');
        
        if (!releaseLink) return;

        const releaseUrl = releaseLink.href;
        
        // Skip master releases
        if (releaseUrl.includes('/master/')) {
          return;
        }
        
        const releaseId = releaseUrl.match(/\/release\/(\d+)/)?.[1];
        
        if (!releaseId) return;

        // Skip if we've already seen this release (deduplication)
        if (seenReleaseIds.has(releaseId)) {
          return;
        }
        seenReleaseIds.add(releaseId);

        // Extract artist and title
        const titleEl = item.querySelector('.title a, a[href*="/release/"]');
        let artist = '';
        let title = '';
        
        if (titleEl) {
          const fullTitle = titleEl.textContent?.trim() || '';
          // Format is usually "Artist - Title"
          const parts = fullTitle.split(' - ');
          if (parts.length >= 2) {
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
          } else {
            title = fullTitle;
          }
        }
        
        // Try to get artist from separate element if available
        const artistEl = item.querySelector('.artist a, [class*="artist"]');
        if (artistEl && !artist) {
          artist = artistEl.textContent.trim();
        }

        // Extract format
        const formatEl = item.querySelector('[class*="format"], .card_body .format');
        const format = formatEl?.textContent?.trim() || 'Unknown';

        // Extract year
        const yearEl = item.querySelector('[class*="year"], .card_body');
        const yearMatch = yearEl?.textContent?.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : '';

        // Extract thumbnail if available
        const thumbnailEl = item.querySelector('img[src*="discogs"], img.card_image');
        const thumbnail = thumbnailEl?.src || '';

        const record = {
          releaseId,
          discogsUrl: releaseUrl,
          artist: artist || 'Unknown Artist',
          title: title || 'Unknown Title',
          format,
          year,
          thumbnail,
          price: 'N/A', // Labels don't have prices
          condition: 'N/A', // Labels don't have condition
          listingId: null // Labels don't have listing IDs
        };

        releases.push(record);
        
      } catch {
        // Skip item on error
      }
    });

    return releases;
  }
  
  // Extract releases from artist page
  function extractArtistReleases() {
    const releases = [];
    const seenReleaseIds = new Set();
    const artistName = getArtistName();

    // Artist pages don't use data-release-id.
    // Master rows only contain /master/ links — so querying /release/ links
    // naturally gives us only actual release rows, skipping masters.
    const releaseLinks = document.querySelectorAll('a[href*="/release/"]');
    const rows = new Set();
    releaseLinks.forEach(link => {
      const row = link.closest('tr');
      if (row) rows.add(row);
    });

    rows.forEach((row) => {
      try {
        // Prefer the link inside the title cell; fall back to any release link in the row
        const titleCell = row.querySelector('td[class*="title"]');
        const releaseLink = (titleCell || row).querySelector('a[href*="/release/"]');
        if (!releaseLink) return;

        const releaseUrl = releaseLink.href;
        const releaseId = releaseUrl.match(/\/release\/(\d+)/)?.[1];
        if (!releaseId) return;

        if (seenReleaseIds.has(releaseId)) return;
        seenReleaseIds.add(releaseId);

        // Title text is "Artist1, Artist2 – Title" (en-dash U+2013) — take everything after the dash
        const fullText = releaseLink.textContent?.trim() || '';
        const dashIdx = fullText.indexOf(' \u2013 ');
        const title = dashIdx >= 0 ? fullText.slice(dashIdx + 3).trim() : fullText;

        // Year cell has a class containing "year"
        const yearCell = row.querySelector('td[class*="year"]');
        const year = yearCell?.textContent?.trim() || '';

        const thumbnail = row.querySelector('img[src*="discogs"]')?.src || '';

        releases.push({
          releaseId,
          discogsUrl: releaseUrl,
          artist: artistName,
          title: title || 'Unknown Title',
          format: 'Unknown',
          year,
          thumbnail,
          price: 'N/A',
          condition: 'N/A',
          listingId: null
        });

      } catch {
        // Skip row on error
      }
    });

    return releases;
  }

  // Extract records from seller inventory page
  function extractSellerRecords() {
    const records = [];
    
    // On seller inventory pages, each item has a "View Release Page" link
    // We need to find these links and associate them with the record info
    const items = document.querySelectorAll('tr.shortcut_navigable');
    
    
    items.forEach((item, index) => {
      try {
        // Find the "View Release Page" link - this is the direct link we need
        const releasePageLink = item.querySelector('a[href*="/release/"]:not([href*="/releases"])');
        
        if (!releasePageLink) return;

        const releaseUrl = releasePageLink.href;
        const releaseId = releaseUrl.match(/\/release\/(\d+)/)?.[1];
        
        if (!releaseId) return;

        // Extract artist and title from the item description
        const descriptionLink = item.querySelector('a.item_description_title');
        let artist = '';
        let title = '';
        
        if (descriptionLink) {
          const fullTitle = descriptionLink.textContent?.trim() || '';
          // Format is usually "Artist - Title"
          const parts = fullTitle.split(' - ');
          if (parts.length >= 2) {
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
          } else {
            title = fullTitle;
          }
        }

        // Extract price
        const priceEl = item.querySelector('.price');
        const priceText = priceEl?.textContent?.trim() || '$0.00';
        const priceMatch = priceText.match(/[\d.]+/);
        const priceValue = priceMatch ? parseFloat(priceMatch[0]) : 0;

        // Extract condition
        const conditionEl = item.querySelector('.item_sleeve_condition, .item_condition');
        const condition = conditionEl?.textContent?.trim() || 'Unknown';

        // Extract format
        const formatEl = item.querySelector('.item_description .item_description_format');
        const format = formatEl?.textContent?.trim() || 'Unknown';

        // Extract thumbnail if available
        const thumbnailEl = item.querySelector('img.marketplace_image');
        const thumbnail = thumbnailEl?.src || '';

        // The listing ID for cart operations
        const listingIdMatch = item.id?.match(/\d+/) || item.innerHTML.match(/item_id["\s:=]+(\d+)/i);
        const listingId = listingIdMatch?.[1] || listingIdMatch?.[0] || releaseId;

        const record = {
          discogsUrl: releaseUrl, // This is now the direct release page URL!
          releaseId: releaseId,
          listingId: listingId,
          artist: artist,
          title: title,
          price: priceText,
          priceValue: priceValue,
          condition: condition,
          format: format,
          thumbnail: thumbnail,
          videoId: null, // Will be filled during extraction
          status: {
            inCart: false,
            inWantlist: false,
            listened: false,
            rating: null
          }
        };

        records.push(record);
      } catch {
        // Skip item on error
      }
    });

    return records;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === 'detectRecords') {
      try {
        const pageType = getPageType();
        const records = extractRecordsFromPage();
        const pagination = getPaginationInfo();
        const pageUrls = getAllPageUrls();
        const labelName = pageType === 'label' ? getLabelName() : null;
        const artistName = pageType === 'artist' ? getArtistName() : null;

        sendResponse({
          success: true,
          pageType: pageType,
          labelName: labelName,
          artistName: artistName,
          records: records,
          count: records.length,
          pagination: pagination,
          pageUrls: pageUrls
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return true; // Will respond asynchronously
    }

    if (request.action === 'extractVideo') {
      try {
        // Extract video from the current page (called when we navigate to a release page)
        const iframes = document.querySelectorAll('iframe[src*="youtube"], iframe[data-src*="youtube"]');
        const links = document.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]');
        
        let videoId = null;

        // Try to find video in iframes first
        for (const iframe of iframes) {
          const src = iframe.src || iframe.dataset.src || '';
          videoId = extractYouTubeId(src);
          if (videoId) break;
        }

        // If not found in iframes, try links
        if (!videoId) {
          for (const link of links) {
            videoId = extractYouTubeId(link.href);
            if (videoId) break;
          }
        }

        sendResponse({ success: true, videoId: videoId });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });

  // Helper function to extract YouTube video ID from URL
  function extractYouTubeId(url) {
    if (!url) return null;
    
    // Various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/\?v=([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  // Notify popup that content script is ready
  chrome.runtime.sendMessage({ action: 'contentScriptReady' });
})();
