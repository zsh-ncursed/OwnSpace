import { describe, it, expect } from 'vitest';
import { parseStartMeHtml } from '../src/bookmark-importer.js';

// @vitest-environment jsdom

describe('parseStartMeHtml', () => {
  it('returns empty for plain HTML', () => {
    const result = parseStartMeHtml('<html><body><p>No bookmarks</p></body></html>');
    expect(result.bookmarks).toEqual([]);
    expect(result.widgetGroups).toEqual([]);
  });

  it('parses start.me widget bookmarks', () => {
    const html = `
      <div class="bookmark-widget">
        <div class="widget-header__text">My Widget</div>
        <a class="bookmark-item__link" href="https://example.com" title="Example Site
Extra line">
          <span class="bookmark-item__title">Example</span>
        </a>
        <a class="bookmark-item__link" href="https://test.com" title="Test Page">
          <span class="bookmark-item__title">Test</span>
        </a>
      </div>
    `;
    const result = parseStartMeHtml(html);
    expect(result.bookmarks).toHaveLength(2);
    expect(result.bookmarks[0].url).toBe('https://example.com');
    expect(result.bookmarks[0].title).toBe('Example');
    expect(result.bookmarks[0].favicon).toContain('google.com/s2/favicons');
    expect(result.widgetGroups).toHaveLength(1);
    expect(result.widgetGroups[0].name).toBe('My Widget');
  });

  it('filters out javascript: URLs', () => {
    const html = `
      <div class="bookmark-widget">
        <a class="bookmark-item__link" href="javascript:void(0)" title="Bad">
          <span class="bookmark-item__title">Bad</span>
        </a>
        <a class="bookmark-item__link" href="https://good.com" title="Good">
          <span class="bookmark-item__title">Good</span>
        </a>
      </div>
    `;
    const result = parseStartMeHtml(html);
    expect(result.bookmarks).toHaveLength(1);
    expect(result.bookmarks[0].url).toBe('https://good.com');
  });

  it('falls back to regex for plain links', () => {
    const html = `
      <a class="bookmark-item__link" href="https://fallback.com" title="Fallback Site">
      </a>
    `;
    const result = parseStartMeHtml(html);
    expect(result.bookmarks).toHaveLength(1);
    expect(result.bookmarks[0].url).toBe('https://fallback.com');
    expect(result.widgetGroups[0].name).toBe('Импорт закладок');
  });
});
