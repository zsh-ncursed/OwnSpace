import { describe, it, expect } from 'vitest';
import {
  sha256Hex,
  encryptJson,
  decryptJson,
  deriveMasterPasswordHash,
  verifyMasterPassword,
} from '../src/crypto.js';
import { encryptLegacy } from './helpers/legacy-encrypt.js';

describe('sha256Hex', () => {
  it('produces 64 hex chars', async () => {
    const hash = await sha256Hex('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await sha256Hex('test');
    const b = await sha256Hex('test');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await sha256Hex('hello');
    const b = await sha256Hex('world');
    expect(a).not.toBe(b);
  });
});

describe('deriveMasterPasswordHash / verifyMasterPassword', () => {
  it('produces a salted PBKDF2 record with 100k iterations', async () => {
    const rec = await deriveMasterPasswordHash('secret123');
    expect(rec).toHaveProperty('salt');
    expect(rec).toHaveProperty('hash');
    expect(rec.iterations).toBe(100000);
    expect(rec.salt).toHaveLength(16);
    expect(rec.hash).toHaveLength(32);
  });

  it('uses a random salt (same password → different records)', async () => {
    const a = await deriveMasterPasswordHash('same-pw');
    const b = await deriveMasterPasswordHash('same-pw');
    expect(a.salt).not.toEqual(b.salt);
    expect(a.hash).not.toEqual(b.hash);
  });

  it('verifies the correct password', async () => {
    const rec = await deriveMasterPasswordHash('correct horse');
    expect(await verifyMasterPassword('correct horse', rec)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const rec = await deriveMasterPasswordHash('correct horse');
    expect(await verifyMasterPassword('battery staple', rec)).toBe(false);
  });

  it('rejects null / non-object records', async () => {
    expect(await verifyMasterPassword('pw', null)).toBe(false);
    expect(await verifyMasterPassword('pw', 'legacy-hex-string')).toBe(false);
    expect(await verifyMasterPassword('pw', {})).toBe(false);
  });

  it('rejects oversized salt/hash records (corruption guard)', async () => {
    const rec = await deriveMasterPasswordHash('pw');
    const hugeSalt = { ...rec, salt: new Array(100000).fill(1) };
    const hugeHash = { ...rec, hash: new Array(100000).fill(1) };
    expect(await verifyMasterPassword('pw', hugeSalt)).toBe(false);
    expect(await verifyMasterPassword('pw', hugeHash)).toBe(false);
  });
});

describe('encryptJson / decryptJson roundtrip', () => {
  it('encrypts and decrypts data correctly (with embedded salt)', async () => {
    const data = { foo: 'bar', num: 42 };
    const encrypted = await encryptJson(data, 'mysecret');
    expect(encrypted).toHaveProperty('salt');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('data');
    expect(encrypted.salt).toHaveLength(16);
    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.data.length).toBeGreaterThan(0);

    const decrypted = await decryptJson(encrypted, 'mysecret');
    expect(decrypted).toEqual(data);
  });

  it('fails with wrong password', async () => {
    const encrypted = await encryptJson('secret data', 'correct');
    await expect(decryptJson(encrypted, 'wrong')).rejects.toThrow();
  });

  it('rejects non-serializable values with a clear error', async () => {
    // toThrow('must be JSON-serializable') matches both the TypeError class
    // and the descriptive message; each call throws before any crypto work.
    await expect(encryptJson(undefined, 'pw')).rejects.toThrow(
      'must be JSON-serializable',
    );
    await expect(encryptJson(() => {}, 'pw')).rejects.toThrow(
      'must be JSON-serializable',
    );
    await expect(encryptJson(Symbol('x'), 'pw')).rejects.toThrow(
      'must be JSON-serializable',
    );
    await expect(encryptJson(10n, 'pw')).rejects.toThrow(
      'must be JSON-serializable',
    );
  });

  it('rejects missing, empty or non-string passwords', async () => {
    const message = 'password must be a non-empty string';
    // Each call throws before any crypto work — no PBKDF2 iterations run.
    await expect(encryptJson({ x: 1 })).rejects.toThrow(message);
    await expect(encryptJson({ x: 1 }, '')).rejects.toThrow(message);
    await expect(encryptJson({ x: 1 }, null)).rejects.toThrow(message);
    await expect(encryptJson({ x: 1 }, 42)).rejects.toThrow(message);
    await expect(encryptJson({ x: 1 }, undefined)).rejects.toThrow(message);

    // Sanity: a valid password still works.
    const encrypted = await encryptJson({ x: 1 }, 'valid-pass');
    expect(await decryptJson(encrypted, 'valid-pass')).toEqual({ x: 1 });
  });

  it('uses a fresh random salt on every encryption', async () => {
    const a = await encryptJson({ x: 1 }, 'same-pw');
    const b = await encryptJson({ x: 1 }, 'same-pw');
    expect(a.salt).not.toEqual(b.salt);
    expect(a.data).not.toEqual(b.data);
  });

  it('decrypts legacy payloads without a salt field (fixed legacy salt fallback)', async () => {
    // Replicate the pre-salt scheme: PBKDF2 with the hardcoded
    // 'ownspace-encryption-v1' salt, no salt embedded in the payload.
    const legacyPayload = await encryptLegacy({ legacy: true }, 'legacy-pass');
    const decrypted = await decryptJson(legacyPayload, 'legacy-pass');
    expect(decrypted).toEqual({ legacy: true });
  });

  it('ignores an oversized embedded salt (falls back to legacy salt)', async () => {
    // Legacy ciphertext carrying a bogus oversized salt field. decryptJson must
    // reject the oversized salt (> 64) and fall back to the legacy salt, so
    // the legacy ciphertext still decrypts without a huge allocation.
    const legacyPayload = await encryptLegacy({ legacy: true }, 'legacy-pass');
    const payload = {
      salt: new Array(100000).fill(1), // oversized — must be ignored
      ...legacyPayload,
    };

    const decrypted = await decryptJson(payload, 'legacy-pass');
    expect(decrypted).toEqual({ legacy: true });
  });

  it('rejects malformed/oversized iv and data (corruption guard)', async () => {
    const encrypted = await encryptJson({ ok: true }, 'pw');
    const data = encrypted.data; // valid ciphertext for reuse below

    // Non-array iv/data must be rejected before any Uint8Array allocation.
    await expect(
      decryptJson({ ...encrypted, iv: 'not-an-array' }, 'pw'),
    ).rejects.toThrow();
    await expect(
      decryptJson({ ...encrypted, data: 'not-an-array' }, 'pw'),
    ).rejects.toThrow();

    // Oversized iv (> 64) must be rejected.
    await expect(
      decryptJson({ ...encrypted, iv: new Array(100000).fill(1) }, 'pw'),
    ).rejects.toThrow();

    // Oversized data (> 64 MiB) must be rejected before allocation. A sparse
    // array is used so the test itself does not allocate ~64 MiB.
    await expect(
      decryptJson({ ...encrypted, data: new Array(65 * 1024 * 1024) }, 'pw'),
    ).rejects.toThrow();

    // Sanity: the same ciphertext still decrypts fine with its original iv.
    expect(await decryptJson({ ...encrypted, data }, 'pw')).toEqual({
      ok: true,
    });
  });
});


