import { describe, it, expect, beforeEach } from 'vitest';

// Import the parser functions by reading and evaluating the module
let parseHtml, parseStartMeHtml, parseGenericHtml, validateBookmarks;

beforeEach(async () => {
  // Read and evaluate the parser module
  const fs = await import('fs');
  const path = await import('path');
  const modulePath = path.resolve('./src/utils/import/startme-parser.js');
  const moduleCode = fs.readFileSync(modulePath, 'utf-8');
  
  // Create a mock crypto.randomUUID for Node environment
  if (!global.crypto) {
    global.crypto = {};
  }
  global.crypto.randomUUID = () => 'test-uuid-' + Math.random().toString(36).substr(2, 9);
  
  // Evaluate the module code
  eval(moduleCode);
  
  // Extract exported functions
  parseHtml = window.BookmarkParser.parseHtml;
  parseStartMeHtml = window.BookmarkParser.parseStartMeHtml;
  parseGenericHtml = window.BookmarkParser.parseGenericHtml;
  validateBookmarks = window.BookmarkParser.validateBookmarks;
});

describe('startme-parser.js', () => {
  describe('parseStartMeHtml', () => {
    it('should parse start.me HTML with widget groups', () => {
      const html = `
        <article class="bookmark-widget">
          <div class="widget-header">
            <span class="widget-header__text">My Bookmarks</span>
          </div>
          <a class="bookmark-item__link" href="https://example.com" title="Example Site">
            <span class="bookmark-item__title">Example</span>
          </a>
          <a class="bookmark-item__link" href="https://google.com" title="Google Search">
            <span class="bookmark-item__title">Google</span>
          </a>
        </article>
      `;
      
      const result = parseStartMeHtml(html);
      
      expect(result.bookmarks).toBeDefined();
      expect(result.widgetGroups).toBeDefined();
      expect(result.bookmarks.length).toBe(2);
      expect(result.widgetGroups.length).toBe(1);
      expect(result.widgetGroups[0].name).toBe('My Bookmarks');
      expect(result.widgetGroups[0].bookmarks.length).toBe(2);
    });

    it('should handle empty HTML', () => {
      const result = parseStartMeHtml('<html></html>');
      
      expect(result.bookmarks).toEqual([]);
      expect(result.widgetGroups).toEqual([]);
    });

    it('should extract URL and title from bookmark links', () => {
      const html = `
        <article class="bookmark-widget">
          <span class="widget-header__text">Test</span>
          <a class="bookmark-item__link" href="https://test.com" title="Test Site Description">
            <span class="bookmark-item__title">Test Site</span>
          </a>
        </article>
      `;
      
      const result = parseStartMeHtml(html);
      
      expect(result.bookmarks[0]).toMatchObject({
        url: 'https://test.com',
        title: 'Test Site'
      });
    });

    it('should skip invalid URLs (javascript:, #)', () => {
      const html = `
        <article class="bookmark-widget">
          <span class="widget-header__text">Test</span>
          <a class="bookmark-item__link" href="javascript:void(0)" title="JS Link">
            <span class="bookmark-item__title">JS</span>
          </a>
          <a class="bookmark-item__link" href="#" title="Hash Link">
            <span class="bookmark-item__title">Hash</span>
          </a>
          <a class="bookmark-item__link" href="https://valid.com" title="Valid">
            <span class="bookmark-item__title">Valid</span>
          </a>
        </article>
      `;
      
      const result = parseStartMeHtml(html);
      
      expect(result.bookmarks.length).toBe(1);
      expect(result.bookmarks[0].url).toBe('https://valid.com');
    });

    it('should use URL as title when title is empty', () => {
      const html = `
        <article class="bookmark-widget">
          <span class="widget-header__text">Test</span>
          <a class="bookmark-item__link" href="https://notitle.com" title="">
          </a>
        </article>
      `;
      
      const result = parseStartMeHtml(html);
      
      expect(result.bookmarks[0].title).toBe('https://notitle.com');
    });
  });

  describe('parseGenericHtml', () => {
    it('should parse Netscape bookmark format', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="https://example.com" ADD_DATE="1234567890">Example</A>
          <DT><A HREF="https://google.com" ADD_DATE="1234567891">Google</A>
        </DL><p>
      `;
      
      const result = parseGenericHtml(html);
      
      expect(result.bookmarks.length).toBe(2);
      expect(result.bookmarks[0]).toMatchObject({
        url: 'https://example.com',
        title: 'Example'
      });
    });

    it('should parse simple links when no DL found', () => {
      const html = `
        <html>
          <body>
            <a href="https://link1.com">Link 1</a>
            <a href="https://link2.com">Link 2</a>
          </body>
        </html>
      `;
      
      const result = parseGenericHtml(html);
      
      expect(result.bookmarks.length).toBe(2);
      expect(result.bookmarks[0].url).toBe('https://link1.com');
    });
  });

  describe('parseHtml (auto-detect)', () => {
    it('should detect start.me format', () => {
      const html = `
        <article class="bookmark-widget">
          <a class="bookmark-item__link" href="https://example.com"></a>
        </article>
      `;
      
      const result = parseHtml(html);
      
      expect(result.format).toBe('startme');
    });

    it('should detect generic format', () => {
      const html = `
        <DL><p>
          <DT><A HREF="https://example.com">Example</A>
        </DL><p>
      `;
      
      const result = parseHtml(html);
      
      expect(result.format).toBe('generic');
    });
  });

  describe('validateBookmarks', () => {
    it('should separate valid and invalid bookmarks', () => {
      const bookmarks = [
        { url: 'https://valid.com', title: 'Valid' },
        { url: 'not-a-url', title: 'Invalid' },
        { url: 'https://another-valid.com', title: 'Also Valid' }
      ];
      
      const result = validateBookmarks(bookmarks);
      
      expect(result.valid.length).toBe(2);
      expect(result.invalid.length).toBe(1);
      expect(result.invalid[0].url).toBe('not-a-url');
    });

    it('should handle empty array', () => {
      const result = validateBookmarks([]);
      
      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
    });
  });
});
