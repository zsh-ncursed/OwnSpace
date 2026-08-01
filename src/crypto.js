const ENC_SALT_LENGTH = 16;
// Upper bound for embedded salts in decryptJson: encryptJson always produces
// 16-byte salts. Reject oversized arrays before allocating Uint8Array — a
// corrupted payload must not cause a huge allocation (mirrors the master
// password guards in verifyMasterPassword).
const ENC_SALT_MAX_LENGTH = 64;
// Upper bounds for the remaining decryptJson inputs, mirroring the same
// guard: encryptJson always produces a 12-byte IV, and ciphertext is bounded
// by the exported state (workspaces + theme + CalDAV credentials — far below
// 64 MiB). Reject oversized arrays before allocating Uint8Array.
const ENC_MAX_IV_LENGTH = 64;
const ENC_MAX_DATA_LENGTH = 64 * 1024 * 1024; // 64 MiB
// Fixed salt used before random salts were introduced (pre-1.3 payloads).
// Kept for backward compatibility: decryptJson falls back to it when the
// payload has no embedded salt, so existing exports and CalDAV credentials
// keep decrypting.
const LEGACY_ENC_SALT = 'ownspace-encryption-v1';

async function deriveEncKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Contract: encryptJson/decryptJson take and return *JSON values*, not
// pre-serialized strings — JSON.stringify/parse run inside. Pass any
// JSON-serializable value (object, array, string, number, boolean, null) and
// get the same value back after decryption.

/**
 * Encrypts a JSON-serializable value with a password-derived AES-GCM key.
 *
 * A fresh random salt is embedded in the output so the same password yields a
 * different key for every payload (defeats precomputation attacks on export
 * files). Returns { salt, iv, data } as byte arrays.
 *
 * Throws a clear TypeError for non-serializable input: undefined, functions
 * and symbols would otherwise silently encrypt as the string "undefined",
 * and BigInt/circular structures would leak a cryptic JSON.stringify error.
 * Also rejects a missing/empty/non-string password, which would otherwise
 * silently derive a key from "undefined" or an empty string.
 */
export async function encryptJson(value, password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('encryptJson: password must be a non-empty string');
  }
  const enc = new TextEncoder();
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new TypeError('encryptJson: value must be JSON-serializable');
  }
  // JSON.stringify returns undefined (not a string) for undefined, functions
  // and symbols — reject instead of silently encrypting "undefined".
  if (typeof json !== 'string') {
    throw new TypeError('encryptJson: value must be JSON-serializable');
  }
  const salt = crypto.getRandomValues(new Uint8Array(ENC_SALT_LENGTH));
  const key = await deriveEncKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(json),
  );
  return {
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypts an encryptJson() payload and returns the original JSON value.
 *
 * Uses the salt embedded in the payload, or the fixed legacy salt when the
 * payload predates random salts (old exports / CalDAV credentials). Legacy
 * pre-simplification exports were double-encoded; their plaintext is a string,
 * which the caller (importData) detects and parses once more.
 */
export async function decryptJson(encryptedObj, password) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  // New payloads carry their own random salt. Legacy payloads (encrypted
  // before salts were introduced) have no salt field — fall back to the fixed
  // legacy salt so they keep decrypting.
  const salt =
    Array.isArray(encryptedObj.salt) &&
    encryptedObj.salt.length > 0 &&
    encryptedObj.salt.length <= ENC_SALT_MAX_LENGTH
      ? new Uint8Array(encryptedObj.salt)
      : enc.encode(LEGACY_ENC_SALT);
  // Mirror the master-password guards: reject malformed or oversized iv/data
  // before allocating Uint8Array — a corrupted payload must not cause a huge
  // allocation (or a cryptic WebCrypto error).
  if (
    !Array.isArray(encryptedObj.iv) ||
    encryptedObj.iv.length === 0 ||
    encryptedObj.iv.length > ENC_MAX_IV_LENGTH
  )
    throw new Error('Invalid encrypted payload: IV');
  if (
    !Array.isArray(encryptedObj.data) ||
    encryptedObj.data.length === 0 ||
    encryptedObj.data.length > ENC_MAX_DATA_LENGTH
  )
    throw new Error('Invalid encrypted payload: data');
  const key = await deriveEncKey(password, salt);
  const iv = new Uint8Array(encryptedObj.iv);
  const data = new Uint8Array(encryptedObj.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );
  return JSON.parse(dec.decode(decrypted));
}

export async function sha256Hex(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const MASTER_PASSWORD_ITERATIONS = 100000;
// Upper bounds for the stored record: derivedMasterPasswordHash() always
// produces salt=16B and hash=32B (256-bit). Reject oversized arrays before
// allocating Uint8Array — a corrupted record must not cause a huge allocation.
const MASTER_PASSWORD_MAX_SALT_LENGTH = 64;
const MASTER_PASSWORD_MAX_HASH_LENGTH = 64;

// Master-password verification hash: PBKDF2-SHA-256 with a random per-user
// salt. Replaces the legacy plain sha256Hex() storage — a bare SHA-256 of a
// password is trivially brute-forceable if storage.local is extracted.
// Returns a JSON-serializable record { salt, hash, iterations }.
export async function deriveMasterPasswordHash(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: MASTER_PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return {
    salt: Array.from(salt),
    hash: Array.from(new Uint8Array(bits)),
    iterations: MASTER_PASSWORD_ITERATIONS,
  };
}

// Constant-time comparison of a candidate password against a stored PBKDF2
// record produced by deriveMasterPasswordHash(). Malformed records (corrupt
// or foreign data in storage) return false instead of throwing.
export async function verifyMasterPassword(password, stored) {
  if (!stored || typeof stored !== 'object') return false;
  if (
    !Array.isArray(stored.salt) ||
    stored.salt.length === 0 ||
    stored.salt.length > MASTER_PASSWORD_MAX_SALT_LENGTH
  )
    return false;
  if (
    !Array.isArray(stored.hash) ||
    stored.hash.length === 0 ||
    stored.hash.length > MASTER_PASSWORD_MAX_HASH_LENGTH
  )
    return false;
  const iterations =
    Number.isInteger(stored.iterations) && stored.iterations > 0
      ? stored.iterations
      : MASTER_PASSWORD_ITERATIONS;
  const enc = new TextEncoder();
  const salt = new Uint8Array(stored.salt);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const derived = new Uint8Array(bits);
  const expected = new Uint8Array(stored.hash);
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
}
