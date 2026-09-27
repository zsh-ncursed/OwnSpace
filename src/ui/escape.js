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

// Strict check for base64 image data URLs — the only form the background
// settings UI stores uploads in (FileReader.readAsDataURL). The base64
// alphabet excludes quotes, parens, semicolons and whitespace, so a value
// that passes is safe to interpolate into a CSS url("...") token.
const IMAGE_DATA_URL_RE =
  /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/;

export function safeImageBgUrl(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!IMAGE_DATA_URL_RE.test(v)) return null;
  return v;
}
