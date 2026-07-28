async function deriveEncKey(password) {
  const enc = new TextEncoder();
  const salt = enc.encode('ownspace-encryption-v1');
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

export async function encryptJson(data, password) {
  const enc = new TextEncoder();
  const key = await deriveEncKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data)),
  );
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
}

export async function decryptJson(encryptedObj, password) {
  const dec = new TextDecoder();
  const key = await deriveEncKey(password);
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
