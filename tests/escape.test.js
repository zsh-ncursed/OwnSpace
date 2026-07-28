import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/ui/escape.js';

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
