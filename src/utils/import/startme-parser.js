// Parser for start.me exported HTML pages
// Extracts bookmarks and widget structure from saved HTML

// Auto-detect format and parse HTML
function parseHtml(html) {
  // Try start.me format first
  if (html.includes('bookmark-item__link') || html.includes('start.me')) {
    return { ...parseStartMeHtml(html), format: 'startme' };
  }
  
  // Try generic
  return { ...parseGenericHtml(html), format: 'generic' };
}

// Parse start.me HTML export and extract bookmarks
function parseStartMeHtml(html) {
  // Try DOMParser first (browser environment)
  let bookmarks = [];
  let widgetGroups = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find bookmark widgets and group by them
    const widgetContainers = doc.querySelectorAll('.bookmark-widget');
    
    widgetContainers.forEach(widget => {
      const widgetTitleEl = widget.querySelector('.widget-header__text');
      const widgetTitle = widgetTitleEl ? widgetTitleEl.textContent.trim() : 'Imported';
      
      const widgetBookmarksList = [];
      const bookmarkLinks = widget.querySelectorAll('a.bookmark-item__link');
      
      bookmarkLinks.forEach(link => {
        const bookmark = extractBookmarkFromElement(link);
        if (bookmark) {
          widgetBookmarksList.push(bookmark);
          bookmarks.push(bookmark);
        }
      });
      
      if (widgetBookmarksList.length > 0) {
        widgetGroups.push({
          name: widgetTitle,
          bookmarks: widgetBookmarksList
        });
      }
    });
  } catch (e) {
    // Fallback: regex parsing
    bookmarks = parseStartMeHtmlRegex(html, widgetGroups);
  }
  
  // Fallback: if widget grouping didn't work, parse all links
  if (bookmarks.length === 0) {
    bookmarks = parseAllBookmarkLinks(html);
    if (bookmarks.length > 0) {
      widgetGroups.push({
        name: 'Imported Bookmarks',
        bookmarks: bookmarks
      });
    }
  }
  
  return { bookmarks, widgetGroups };
}

// Regex fallback for parsing start.me HTML
function parseStartMeHtmlRegex(html, widgetGroups) {
  const bookmarks = [];
  
  // Extract widget sections
  const widgetRegex = /<article[^>]*class="[^"]*bookmark-widget[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let widgetMatch;
  
  while ((widgetMatch = widgetRegex.exec(html)) !== null) {
    const widgetHtml = widgetMatch[1];
    
    // Get widget title
    const titleMatch = widgetHtml.match(/<span[^>]*class="[^"]*widget-header__text[^"]*"[^>]*>([^<]+)<\/span>/);
    const widgetTitle = titleMatch ? titleMatch[1].trim() : 'Imported';
    
    // Get all bookmark links in this widget
    const linkRegex = /<a class="bookmark-item__link"[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>/g;
    let linkMatch;
    const widgetBookmarksList = [];
    
    while ((linkMatch = linkRegex.exec(widgetHtml)) !== null) {
      const url = linkMatch[1];
      const titleAttr = linkMatch[2];
      
      if (url && !url.startsWith('#') && !url.startsWith('javascript:')) {
        const parts = titleAttr.split('\n');
        const title = parts[0].trim();
        
        widgetBookmarksList.push({
          id: crypto.randomUUID(),
          url: url,
          title: title || url,
          description: parts.length > 1 ? parts.slice(1).join('\n').trim() : null,
          favicon: null
        });
      }
    }
    
    if (widgetBookmarksList.length > 0) {
      widgetGroups.push({
        name: widgetTitle,
        bookmarks: widgetBookmarksList
      });
      bookmarks.push(...widgetBookmarksList);
    }
  }
  
  return bookmarks;
}

// Parse all bookmark links without grouping
function parseAllBookmarkLinks(html) {
  const bookmarks = [];
  const linkRegex = /<a class="bookmark-item__link"[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>/g;
  let linkMatch;
  
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const url = linkMatch[1];
    const titleAttr = linkMatch[2];
    
    if (url && !url.startsWith('#') && !url.startsWith('javascript:')) {
      const parts = titleAttr.split('\n');
      const title = parts[0].trim();
      
      bookmarks.push({
        id: crypto.randomUUID(),
        url: url,
        title: title || url,
        description: parts.length > 1 ? parts.slice(1).join('\n').trim() : null,
        favicon: null
      });
    }
  }
  
  return bookmarks;
}

// Extract bookmark data from a single link element
function extractBookmarkFromElement(link) {
  const url = link.getAttribute('href');
  
  // Skip invalid URLs
  if (!url || url.startsWith('#') || url.startsWith('javascript:')) {
    return null;
  }
  
  // Get title from span or title attribute
  let title = '';
  const titleSpan = link.querySelector('.bookmark-item__title');
  if (titleSpan) {
    title = titleSpan.textContent.trim();
  }
  
  if (!title) {
    const titleAttr = link.getAttribute('title') || '';
    const parts = titleAttr.split('\n');
    title = parts[0].trim();
  }
  
  // Get description from title attribute
  const titleAttr = link.getAttribute('title') || '';
  const descParts = titleAttr.split('\n');
  const description = descParts.length > 1 ? descParts.slice(1).join('\n').trim() : '';
  
  // Get favicon
  let favicon = null;
  const faviconImg = link.querySelector('.bookmark-item__icon img');
  if (faviconImg && faviconImg.src) {
    favicon = faviconImg.src;
    // If it's a local path (from saved HTML), skip it
    if (favicon.includes('nero%20-%20Start.me_files') || favicon.includes('Start.me_files')) {
      favicon = null;
    }
  }
  
  return {
    id: crypto.randomUUID(),
    url: url,
    title: title || url,
    description: description || null,
    favicon: favicon
  };
}

// Parse generic HTML bookmarks (Netscape format, etc.)
function parseGenericHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const bookmarks = [];
  
  // Try Netscape bookmark format
  const dlElements = doc.querySelectorAll('dl');
  
  if (dlElements.length > 0) {
    // Netscape bookmark format
    parseNetscapeBookmarks(dlElements[0], bookmarks);
  } else {
    // Try finding all <a> tags with href
    const links = doc.querySelectorAll('a[href]');
    links.forEach(link => {
      const url = link.getAttribute('href');
      if (url && !url.startsWith('#') && !url.startsWith('javascript:')) {
        bookmarks.push({
          id: crypto.randomUUID(),
          url: url,
          title: link.textContent.trim() || url,
          description: null,
          favicon: null
        });
      }
    });
  }
  
  return { 
    bookmarks, 
    widgetGroups: [{ name: 'Imported', bookmarks }] 
  };
}

// Parse Netscape bookmark format (recursive for folders)
function parseNetscapeBookmarks(element, bookmarks, folderName = '') {
  const children = element.children;
  
  for (const child of children) {
    if (child.tagName === 'DT') {
      // Check for H3 (folder) or A (bookmark)
      const h3 = child.querySelector(':scope > h3');
      const a = child.querySelector(':scope > a');
      
      if (h3) {
        // Folder - recurse
        const dl = child.querySelector('dl');
        if (dl) {
          parseNetscapeBookmarks(dl, bookmarks, h3.textContent.trim());
        }
      } else if (a) {
        // Bookmark
        const url = a.getAttribute('href');
        if (url && !url.startsWith('javascript:')) {
          bookmarks.push({
            id: crypto.randomUUID(),
            url: url,
            title: a.textContent.trim() || url,
            description: a.getAttribute('description') || null,
            favicon: null
          });
        }
      }
    }
  }
}

// Validate parsed bookmarks
function validateBookmarks(bookmarks) {
  const valid = [];
  const invalid = [];
  
  bookmarks.forEach(bm => {
    try {
      new URL(bm.url);
      valid.push(bm);
    } catch {
      invalid.push(bm);
    }
  });
  
  return { valid, invalid };
}

// Export for use
window.BookmarkParser = {
  parseHtml,
  parseStartMeHtml,
  parseGenericHtml,
  validateBookmarks
};