import { describe, it, expect } from 'vitest';
import { escapeHtml, safeUrl, safeImageBgUrl } from '../src/ui/escape.js';

describe('escapeHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('handles plain text', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('escapes all special chars', () => {
    expect(escapeHtml('<a href="x" title=\'y\'>&</a>')).toBe(
      '&lt;a href=&quot;x&quot; title=&#039;y&#039;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('safeUrl', () => {
  it('allows http and https URLs', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com');
    expect(safeUrl('http://example.com/path?q=1')).toBe('http://example.com/path?q=1');
  });

  it('rejects javascript: URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects strings with quotes (attribute breakout)', () => {
    expect(safeUrl('x" onerror="alert(1)')).toBeNull();
    expect(safeUrl("x' onerror='alert(1)")).toBeNull();
  });

  it('rejects strings with angle brackets', () => {
    expect(safeUrl('https://x.com/<script>')).toBeNull();
  });

  it('rejects non-string and empty input', () => {
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(123)).toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
  });
});

describe('safeImageBgUrl', () => {
  it('accepts base64 image data URLs of supported types', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    expect(safeImageBgUrl(png)).toBe(png);
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
    expect(safeImageBgUrl(jpeg)).toBe(jpeg);
    const webp = 'data:image/webp;base64,UklGRkBAAABXRUJQ==';
    expect(safeImageBgUrl(webp)).toBe(webp);
    const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP==';
    expect(safeImageBgUrl(gif)).toBe(gif);
  });

  it('trims surrounding whitespace', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    expect(safeImageBgUrl(`  ${png}\n`)).toBe(png);
  });

  it('rejects non-image data URLs', () => {
    expect(safeImageBgUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(safeImageBgUrl('data:application/pdf;base64,JVBERi0=')).toBeNull();
  });

  it('rejects SVG data URLs (script-capable)', () => {
    expect(safeImageBgUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull();
  });

  it('rejects strings that could break out of a CSS url() token', () => {
    expect(safeImageBgUrl('data:image/png;base64,abc") no-repeat')).toBeNull();
    expect(safeImageBgUrl('data:image/png;base64,ab;c}')).toBeNull();
    expect(safeImageBgUrl('data:image/png;base64,a b')).toBeNull();
  });

  it('rejects malformed base64 payloads', () => {
    expect(safeImageBgUrl('data:image/png;base64,!!!notbase64')).toBeNull();
    expect(safeImageBgUrl('data:image/png;base64,')).toBeNull();
  });

  it('rejects non-string and empty input', () => {
    expect(safeImageBgUrl(null)).toBeNull();
    expect(safeImageBgUrl(undefined)).toBeNull();
    expect(safeImageBgUrl('')).toBeNull();
    expect(safeImageBgUrl(123)).toBeNull();
  });
});
