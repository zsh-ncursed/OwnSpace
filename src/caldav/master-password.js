import {
  sha256Hex,
  encryptJson,
  decryptJson,
  deriveMasterPasswordHash,
  verifyMasterPassword,
} from '../crypto.js';
import {
  getSettings,
  saveSettings,
  getCalDAVCredentials,
  saveCalDAVCredentials,
} from '../storage.js';
import { escapeHtml } from '../ui/escape.js';
import { showNotification } from '../ui/modals.js';
import { t } from '../i18n/index.js';

let cachedMasterPassword = null;
let masterPasswordTimer = null;
const MASTER_PASSWORD_TTL_MS = 15 * 60 * 1000;

function cacheMasterPassword(pw) {
  cachedMasterPassword = pw;
  if (masterPasswordTimer) clearTimeout(masterPasswordTimer);
  masterPasswordTimer = setTimeout(() => {
    cachedMasterPassword = null;
    masterPasswordTimer = null;
    console.log('[MasterPassword] Cache expired');
  }, MASTER_PASSWORD_TTL_MS);
}

export function clearMasterPasswordCache() {
  cachedMasterPassword = null;
  if (masterPasswordTimer) {
    clearTimeout(masterPasswordTimer);
    masterPasswordTimer = null;
  }
}

// Stored value is either a legacy plain SHA-256 hex string (auto-migrated to
// PBKDF2 on first successful login) or a PBKDF2 record
// { salt, hash, iterations } from deriveMasterPasswordHash().
export async function getMasterPasswordData() {
  const s = await getSettings();
  return s.masterPasswordHash || '';
}

async function setMasterPasswordData(data) {
  const s = await getSettings();
  await saveSettings({ ...s, masterPasswordHash: data });
}

// Verifies a password against the stored format. Legacy hex records verify via
// sha256Hex and are transparently upgraded to the PBKDF2 format in storage.
async function verifyStoredMasterPassword(pw, stored) {
  if (typeof stored === 'string') {
    if ((await sha256Hex(pw)) !== stored) return false;
    await setMasterPasswordData(await deriveMasterPasswordHash(pw));
    return true;
  }
  return verifyMasterPassword(pw, stored);
}

function showSetupMasterPasswordModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>${t('modal.mp.create_title')}</h3>
        <p style="margin: 8px 0 16px; opacity: 0.8; font-size: 14px;">
          ${t('modal.mp.create_hint')}
        </p>
        <div class="caldav-form">
          <label>${t('modal.mp.new')}</label>
          <input type="password" id="mp-new" autocomplete="new-password" />

          <label>${t('modal.mp.confirm')}</label>
          <input type="password" id="mp-confirm" autocomplete="new-password" />

          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;"></div>
        </div>
        <button id="mp-save">${t('modal.mp.save')}</button>
        <button class="modal-close" id="mp-cancel">${t('common.cancel')}</button>
      </div>
    `;
    document.body.appendChild(modal);

    const errorEl = modal.querySelector('#mp-error');
    const newInput = modal.querySelector('#mp-new');
    const confirmInput = modal.querySelector('#mp-confirm');

    const cleanup = (result) => {
      modal.remove();
      resolve(result);
    };

    modal.querySelector('#mp-save').addEventListener('click', () => {
      const pw = newInput.value;
      const confirm = confirmInput.value;
      if (!pw || pw.length < 6) {
        errorEl.textContent = t('modal.mp.too_short');
        return;
      }
      if (pw !== confirm) {
        errorEl.textContent = t('modal.mp.empty');
        return;
      }
      cleanup(pw);
    });

    modal
      .querySelector('#mp-cancel')
      .addEventListener('click', () => cleanup(null));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup(null);
    });
    setTimeout(() => newInput.focus(), 50);
  });
}

function showPromptMasterPasswordModal(initialMessage = '') {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>${t('modal.mp.prompt_title')}</h3>
        <p style="margin: 8px 0 16px; opacity: 0.8; font-size: 14px;">
          ${t('modal.mp.prompt_hint')}
        </p>
        <div class="caldav-form">
          <input type="password" id="mp-prompt" autocomplete="current-password" />
          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;">${escapeHtml(initialMessage)}</div>
        </div>
        <button id="mp-ok">${t('modal.mp.confirm_btn')}</button>
        <button class="modal-close" id="mp-cancel">${t('common.cancel')}</button>
      </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('#mp-prompt');

    const cleanup = (result) => {
      modal.remove();
      resolve(result);
    };

    const submit = () => {
      const pw = input.value;
      if (!pw) return;
      cleanup(pw);
    };

    modal.querySelector('#mp-ok').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    modal
      .querySelector('#mp-cancel')
      .addEventListener('click', () => cleanup(null));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup(null);
    });
    setTimeout(() => input.focus(), 50);
  });
}

export async function ensureMasterPassword() {
  if (cachedMasterPassword) {
    cacheMasterPassword(cachedMasterPassword);
    return cachedMasterPassword;
  }

  const stored = await getMasterPasswordData();
  if (!stored) {
    const pw = await showSetupMasterPasswordModal();
    if (!pw) return null;
    const data = await deriveMasterPasswordHash(pw);
    await setMasterPasswordData(data);
    cacheMasterPassword(pw);
    return pw;
  }

  let attempt = 0;
  let message = '';
  while (attempt < 3) {
    const pw = await showPromptMasterPasswordModal(message);
    if (pw === null) return null;
    if (await verifyStoredMasterPassword(pw, stored)) {
      cacheMasterPassword(pw);
      return pw;
    }
    attempt++;
    message = t('modal.mp.wrong_attempt', { n: attempt });
  }
  return null;
}

export function showChangeMasterPasswordModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>${t('modal.mp.change_title')}</h3>
        <div class="caldav-form">
          <label>${t('modal.mp.old')}</label>
          <input type="password" id="mp-old" autocomplete="current-password" />

          <label>${t('modal.mp.new')}</label>
          <input type="password" id="mp-new" autocomplete="new-password" />

          <label>${t('modal.mp.confirm')}</label>
          <input type="password" id="mp-confirm" autocomplete="new-password" />

          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;"></div>
        </div>
        <button id="mp-change">${t('modal.mp.change_btn')}</button>
        <button class="modal-close" id="mp-cancel">${t('common.cancel')}</button>
      </div>
    `;
    document.body.appendChild(modal);

    const errorEl = modal.querySelector('#mp-error');
    const oldInput = modal.querySelector('#mp-old');
    const newInput = modal.querySelector('#mp-new');
    const confirmInput = modal.querySelector('#mp-confirm');

    const cleanup = (result) => {
      modal.remove();
      resolve(result);
    };

    modal.querySelector('#mp-change').addEventListener('click', async () => {
      const oldPw = oldInput.value;
      const newPw = newInput.value;
      const confirm = confirmInput.value;

      if (!oldPw || !newPw) {
        errorEl.textContent = t('modal.caldav.fill_all');
        return;
      }
      if (newPw.length < 6) {
        errorEl.textContent = t('modal.mp.too_short');
        return;
      }
      if (newPw !== confirm) {
        errorEl.textContent = t('modal.mp.empty');
        return;
      }

      const storedData = await getMasterPasswordData();
      if (
        !storedData ||
        !(await verifyStoredMasterPassword(oldPw, storedData))
      ) {
        errorEl.textContent = t('modal.mp.wrong_old');
        return;
      }

      const stored = await getCalDAVCredentials();
      if (stored && stored.encryptedCreds) {
        try {
          const decrypted = await decryptJson(stored.encryptedCreds, oldPw);
          const reEncrypted = await encryptJson(decrypted, newPw);
          await saveCalDAVCredentials({
            url: stored.url,
            encryptedCreds: reEncrypted,
          });
        } catch {
          errorEl.textContent = t('modal.mp.decrypt_fail');
          return;
        }
      }

      const newData = await deriveMasterPasswordHash(newPw);
      await setMasterPasswordData(newData);
      cacheMasterPassword(newPw);
      cleanup(true);
    });

    modal
      .querySelector('#mp-cancel')
      .addEventListener('click', () => cleanup(false));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup(false);
    });
    setTimeout(() => oldInput.focus(), 50);
  });
}

export async function loadCalDAVCredentialsDecrypted() {
  const stored = await getCalDAVCredentials();
  if (!stored) return null;

  if (stored.encryptedCreds) {
    const pw = await ensureMasterPassword();
    if (!pw) return null;
    try {
      const decrypted = await decryptJson(stored.encryptedCreds, pw);
      return {
        url: stored.url,
        username: decrypted.username,
        password: decrypted.password,
      };
    } catch (e) {
      console.error('[CalDAV] Decryption failed:', e);
      showNotification(
        t('modal.mp.decrypt_fail'),
      );
      return null;
    }
  }

  if (typeof stored.password === 'string') {
    let plainPassword;
    try {
      plainPassword = atob(stored.password);
    } catch {
      plainPassword = stored.password;
    }
    const username = stored.username || '';

    const pw = await ensureMasterPassword();
    if (pw) {
      try {
        const encryptedCreds = await encryptJson(
          { username, password: plainPassword },
          pw,
        );
        await saveCalDAVCredentials({
          url: stored.url,
          encryptedCreds,
        });
        console.log(
          '[CalDAV] Migrated legacy credentials to encrypted format',
        );
      } catch (e) {
        console.error('[CalDAV] Migration failed:', e);
      }
    }

    return { url: stored.url, username, password: plainPassword };
  }

  return null;
}
