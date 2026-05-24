import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt, hashPassword } from '../src/utils/crypto.js';

describe('crypto.js', () => {
  describe('hashPassword', () => {
    it('should return a hex string hash', async () => {
      const password = 'test123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce different hashes for different passwords', async () => {
      const hash1 = await hashPassword('password1');
      const hash2 = await hashPassword('password2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash for same password', async () => {
      const hash1 = await hashPassword('samepassword');
      const hash2 = await hashPassword('samepassword');
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const password = 'testpassword';
      const data = { foo: 'bar', number: 42, nested: { key: 'value' } };
      
      const encrypted = await encrypt(data, password);
      
      expect(encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.data).toBeDefined();
      expect(Array.isArray(encrypted.iv)).toBe(true);
      expect(Array.isArray(encrypted.data)).toBe(true);
      
      const decrypted = await decrypt(encrypted, password);
      
      expect(decrypted).toEqual(data);
    });

    it('should fail to decrypt with wrong password', async () => {
      const password = 'correctpassword';
      const wrongPassword = 'wrongpassword';
      const data = { secret: 'information' };
      
      const encrypted = await encrypt(data, password);
      
      await expect(decrypt(encrypted, wrongPassword)).rejects.toThrow();
    });

    it('should handle empty objects', async () => {
      const password = 'test';
      const data = {};
      
      const encrypted = await encrypt(data, password);
      const decrypted = await decrypt(encrypted, password);
      
      expect(decrypted).toEqual({});
    });

    it('should handle arrays', async () => {
      const password = 'test';
      const data = [1, 2, 3, 'four', { five: 5 }];
      
      const encrypted = await encrypt(data, password);
      const decrypted = await decrypt(encrypted, password);
      
      expect(decrypted).toEqual(data);
    });

    it('should handle strings', async () => {
      const password = 'test';
      const data = 'just a string';
      
      const encrypted = await encrypt(data, password);
      const decrypted = await decrypt(encrypted, password);
      
      expect(decrypted).toBe(data);
    });
  });
});
