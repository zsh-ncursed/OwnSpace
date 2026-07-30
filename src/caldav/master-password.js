import { sha256Hex, encryptJson, decryptJson } from '../crypto.js';
import {
  getSettings,
  saveSettings,
  getCalDAVCredentials,
  saveCalDAVCredentials,
} from '../storage.js';
import { escapeHtml } from '../ui/escape.js';
import { showNotification } from '../ui/modals.js';

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

export async function getMasterPasswordHash() {
  const s = await getSettings();
  return s.masterPasswordHash || '';
}

async function setMasterPasswordHash(hash) {
  const s = await getSettings();
  await saveSettings({ ...s, masterPasswordHash: hash });
}

function showSetupMasterPasswordModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>Создание мастер-пароля</h3>
        <p style="margin: 8px 0 16px; opacity: 0.8; font-size: 14px;">
          Мастер-пароль защищает учётные данные CalDAV. Если вы его забудете —
          восстановить пароль будет невозможно.
        </p>
        <div class="caldav-form">
          <label>Новый пароль:</label>
          <input type="password" id="mp-new" autocomplete="new-password" />

          <label>Повторите пароль:</label>
          <input type="password" id="mp-confirm" autocomplete="new-password" />

          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;"></div>
        </div>
        <button id="mp-save">Создать</button>
        <button class="modal-close" id="mp-cancel">Отмена</button>
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
      if (!pw || pw.length < 4) {
        errorEl.textContent = 'Минимум 4 символа';
        return;
      }
      if (pw !== confirm) {
        errorEl.textContent = 'Пароли не совпадают';
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
        <h3>Введите мастер-пароль</h3>
        <p style="margin: 8px 0 16px; opacity: 0.8; font-size: 14px;">
          Требуется для доступа к зашифрованным учётным данным CalDAV.
        </p>
        <div class="caldav-form">
          <input type="password" id="mp-prompt" autocomplete="current-password" />
          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;">${escapeHtml(initialMessage)}</div>
        </div>
        <button id="mp-ok">Подтвердить</button>
        <button class="modal-close" id="mp-cancel">Отмена</button>
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

  const hash = await getMasterPasswordHash();
  if (!hash) {
    const pw = await showSetupMasterPasswordModal();
    if (!pw) return null;
    const newHash = await sha256Hex(pw);
    await setMasterPasswordHash(newHash);
    cacheMasterPassword(pw);
    return pw;
  }

  let attempt = 0;
  let message = '';
  while (attempt < 3) {
    const pw = await showPromptMasterPasswordModal(message);
    if (pw === null) return null;
    const candidateHash = await sha256Hex(pw);
    if (candidateHash === hash) {
      cacheMasterPassword(pw);
      return pw;
    }
    attempt++;
    message = `Неверный пароль (попытка ${attempt}/3)`;
  }
  return null;
}

export function showChangeMasterPasswordModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>Сменить мастер-пароль</h3>
        <div class="caldav-form">
          <label>Текущий пароль:</label>
          <input type="password" id="mp-old" autocomplete="current-password" />

          <label>Новый пароль:</label>
          <input type="password" id="mp-new" autocomplete="new-password" />

          <label>Повторите новый пароль:</label>
          <input type="password" id="mp-confirm" autocomplete="new-password" />

          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;"></div>
        </div>
        <button id="mp-change">Сменить</button>
        <button class="modal-close" id="mp-cancel">Отмена</button>
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
        errorEl.textContent = 'Заполните все поля';
        return;
      }
      if (newPw.length < 4) {
        errorEl.textContent = 'Новый пароль: минимум 4 символа';
        return;
      }
      if (newPw !== confirm) {
        errorEl.textContent = 'Новые пароли не совпадают';
        return;
      }

      const storedHash = await getMasterPasswordHash();
      const oldHash = await sha256Hex(oldPw);
      if (oldHash !== storedHash) {
        errorEl.textContent = 'Неверный текущий пароль';
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
        } catch (e) {
          errorEl.textContent =
            'Не удалось перешифровать данные: ' + e.message;
          return;
        }
      }

      const newHash = await sha256Hex(newPw);
      await setMasterPasswordHash(newHash);
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
        'Не удалось расшифровать CalDAV. Возможно, данные повреждены.',
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
