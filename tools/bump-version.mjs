#!/usr/bin/env node
/**
 * Increment the patch component of the version in manifest.json (and keep
 * package.json in sync — AMO reads the manifest, npm reads package.json, and
 * the two drifting was already a bug once).
 *
 * Used by CI so that a push to main is always publishable: without a bump,
 * AMO answers "Conflict" because that exact version is already uploaded.
 * A commit that changed the version on purpose is left alone by the caller;
 * this script only ever moves patch forward by one.
 */
import fs from 'node:fs';

const files = ['manifest.json', 'package.json'];

function bumpPatch(version) {
  const parts = String(version).split('.');
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`Unexpected version format: ${version} (expected x.y.z)`);
  }
  parts[2] = String(Number(parts[2]) + 1);
  return parts.join('.');
}

function bumpFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw);
  const next = bumpPatch(json.version);
  json.version = next;
  // Preserve the trailing newline the repo uses.
  const out = `${JSON.stringify(json, null, 2)}\n`;
  fs.writeFileSync(file, out);
  return next;
}

const next = bumpFile('manifest.json');
// package.json is optional in some contexts (the CI runner installs deps, but
// the version field there is informational); skip it only if absent.
if (fs.existsSync('package.json')) {
  bumpFile('package.json');
}

// Machine-readable for CI: the version to release as.
console.log(next);
