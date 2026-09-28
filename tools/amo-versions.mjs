#!/usr/bin/env node
/**
 * Ask AMO which versions of the add-on are already uploaded, so CI can tell
 * whether the version in the tree will be accepted or answered with "Conflict".
 *
 * The browser_specific_settings.gecko.id is the add-on's identity on AMO; the
 * API lists every version, unlisted ones included, but only with a valid JWT.
 *
 * Prints the newest uploaded version, or "none" if the add-on has none.
 */
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const ADDON_ID = JSON.parse(fs.readFileSync('manifest.json', 'utf8'))
  .browser_specific_settings.gecko.id;

const apiKey = process.env.WEB_EXT_API_KEY;
const apiSecret = process.env.WEB_EXT_API_SECRET;
if (!apiKey || !apiSecret) {
  console.error('amo-versions: WEB_EXT_API_KEY / WEB_EXT_API_SECRET are required');
  process.exit(2);
}

// AMO's JWT wants the whole API key as `iss` and the API secret as the HMAC
// key — same split web-ext uses internally.
const token = jwt.sign({ iss: apiKey }, apiSecret, {
  algorithm: 'HS256',
  expiresIn: '5m',
});

const url = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/versions/?filter=all_with_unlisted&ordering=-version`;

try {
  const res = await fetch(url, { headers: { Authorization: `JWT ${token}` } });
  if (!res.ok) {
    console.error(`amo-versions: AMO answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const body = await res.json();
  const versions = (body.results || []).map((v) => v.version);
  console.log(versions[0] || 'none');
} catch (e) {
  console.error(`amo-versions: ${e.message}`);
  process.exit(1);
}
