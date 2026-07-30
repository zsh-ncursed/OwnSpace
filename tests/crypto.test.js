import { describe, it, expect } from 'vitest';
import { sha256Hex, encryptJson, decryptJson } from '../src/crypto.js';

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

describe('encryptJson / decryptJson roundtrip', () => {
  it('encrypts and decrypts data correctly', async () => {
    const data = { foo: 'bar', num: 42 };
    const encrypted = await encryptJson(data, 'mysecret');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('data');
    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.data.length).toBeGreaterThan(0);

    const decrypted = await decryptJson(encrypted, 'mysecret');
    expect(decrypted).toEqual(data);
  });

  it('fails with wrong password', async () => {
    const encrypted = await encryptJson('secret data', 'correct');
    await expect(decryptJson(encrypted, 'wrong')).rejects.toThrow();
  });
});
