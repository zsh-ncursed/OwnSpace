// Integration tests for legacy CalDAV credential decryption through the real
// master-password flow: stored encryptedCreds {iv, data} without a salt field
// (pre-salt format) must still decrypt via the legacy-salt fallback in
// decryptJson. loadCalDAVCredentialsDecrypted() internally prompts for the
// master password via a real DOM modal — these tests drive it in jsdom.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadCalDAVCredentialsDecrypted,
  clearMasterPasswordCache,
} from '../src/caldav/master-password.js';
import { deriveMasterPasswordHash, encryptJson } from '../src/crypto.js';
import { encryptLegacy } from './helpers/legacy-encrypt.js';
import {
  saveCalDAVCredentials,
  saveSettings,
  getSettings,
} from '../src/storage.js';

async function seedMasterPassword(pw) {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    masterPasswordHash: await deriveMasterPasswordHash(pw),
  });
}

// Starts loadCalDAVCredentialsDecrypted() and drives the master-password
// prompt modal it shows: waits for #mp-prompt in the DOM, types the password
// and confirms. Returns the resolved value of the load call.
async function loadWithPassword(pw) {
  const promise = loadCalDAVCredentialsDecrypted();
  await vi.waitFor(
    () => expect(document.querySelector('#mp-prompt')).toBeTruthy(),
    { timeout: 5000 },
  );
  const input = document.querySelector('#mp-prompt');
  input.value = pw;
  document.querySelector('#mp-ok').click();
  return promise;
}

beforeEach(async () => {
  clearMasterPasswordCache(); // module-level 15-min cache must not leak between tests
  // A failed test may leave its modal in the DOM — remove leftovers so
  // vi.waitFor never matches a stale #mp-prompt from a previous test.
  document.querySelectorAll('.modal-overlay').forEach((el) => el.remove());
  await seedMasterPassword('legacy-pass');
});

describe('loadCalDAVCredentialsDecrypted', () => {
  it('decrypts legacy {iv, data} credentials without a salt field', async () => {
    await saveCalDAVCredentials({
      url: 'https://cal.example.com',
      encryptedCreds: await encryptLegacy(
        { username: 'alice', password: 's3cret' },
        'legacy-pass',
      ),
    });

    const result = await loadWithPassword('legacy-pass');
    expect(result).toEqual({
      url: 'https://cal.example.com',
      username: 'alice',
      password: 's3cret',
    });
  });

  it('decrypts current-format credentials (embedded salt) through the same flow', async () => {
    await saveCalDAVCredentials({
      url: 'https://cal.example.com',
      encryptedCreds: await encryptJson(
        { username: 'bob', password: 'hunter2' },
        'legacy-pass',
      ),
    });

    const result = await loadWithPassword('legacy-pass');
    expect(result).toEqual({
      url: 'https://cal.example.com',
      username: 'bob',
      password: 'hunter2',
    });
  });

  it('returns null when credentials were encrypted with a different password', async () => {
    await saveCalDAVCredentials({
      url: 'https://cal.example.com',
      encryptedCreds: await encryptLegacy(
        { username: 'alice', password: 's3cret' },
        'other-pass', // master password is 'legacy-pass' → AES-GCM auth fails
      ),
    });

    const result = await loadWithPassword('legacy-pass');
    expect(result).toBeNull();
  });
});
