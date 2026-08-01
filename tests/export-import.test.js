import { describe, it, expect } from 'vitest';
import { decryptJson } from '../src/crypto.js';
import { exportData, importData } from '../src/export-import.js';
import { saveWorkspaces, getWorkspaces } from '../src/storage.js';

describe('encrypted export/import', () => {
  it('roundtrips encrypted data and preserves the salt field', async () => {
    const ws = [{ id: 'ws-1', name: 'Test', widgets: [] }];
    await saveWorkspaces(ws);

    const json = await exportData(true, 'pass123');
    const parsed = JSON.parse(json);
    expect(parsed.encrypted).toBe(true);
    expect(parsed.salt).toBeDefined();
    expect(parsed.salt).toHaveLength(16);
    expect(parsed.iv).toBeDefined();

    await importData(json, 'pass123');
    expect(await getWorkspaces()).toEqual(ws);
  });

  it('encrypts the payload a single time (decrypts straight to the object)', async () => {
    const json = await exportData(true, 'pass123');
    const parsed = JSON.parse(json);
    const dec = await decryptJson(
      { salt: parsed.salt, iv: parsed.iv, data: parsed.data },
      'pass123',
    );
    // Not a double-encoded string: the plaintext is the export object itself.
    expect(dec).toHaveProperty('workspaces', expect.any(Array));
    expect(dec).toHaveProperty('settings', { theme: expect.any(String) });
    // caldav is null when nothing is configured — the key must exist regardless.
    expect('caldav' in dec).toBe(true);
  });

  it('rejects an encrypted file with a wrong password', async () => {
    const json = await exportData(true, 'right-pass');
    await expect(importData(json, 'wrong-pass')).rejects.toThrow(
      'Invalid import data',
    );
  });

  it('imports a legacy encrypted payload without a salt field', async () => {
    // Build a legacy-format payload the way pre-salt versions did: PBKDF2 with
    // the fixed 'ownspace-encryption-v1' salt and no salt embedded.
    const enc = new TextEncoder();
    const legacySalt = enc.encode('ownspace-encryption-v1');
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode('legacy-pass'),
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
    // Legacy exportData (pre-simplification) called
    // encryptJson(JSON.stringify(data), ...) and encryptJson JSON.stringifies
    // its input again, so old payloads stored a DOUBLE-encoded string.
    // Replicate that exact shape — importData must still handle it.
    const plaintext = JSON.stringify({
      workspaces: [{ id: 'old-1', name: 'Legacy', widgets: [] }],
      settings: { theme: 'dark' },
    });
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify(plaintext)),
    );
    const legacyJson = JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(cipher)),
      encrypted: true,
    });

    await importData(legacyJson, 'legacy-pass');
    expect(await getWorkspaces()).toEqual([
      { id: 'old-1', name: 'Legacy', widgets: [] },
    ]);
  });
});
