export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ponytail: allow only http/https URLs for src/href attributes.
// Rejects javascript:, data:, and any string with quotes that could
// break out of the attribute. Returns null on anything sketchy.
export function safeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (/["'<>]/.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return raw;
  } catch {
    return null;
  }
}
