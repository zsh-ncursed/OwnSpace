// Shared test helper: replicates the pre-salt encryption scheme (PBKDF2 with
// the fixed 'ownspace-encryption-v1' salt) so legacy-format payloads can be
// built in tests. Returns { iv, data } without a salt field — exactly what
// old versions of encryptJson produced.
export async function encryptLegacy(data, password) {
  const enc = new TextEncoder();
  const legacySalt = enc.encode('ownspace-encryption-v1');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: legacySalt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data)),
  );
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(cipher)),
  };
}
