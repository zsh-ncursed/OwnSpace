// Storage utilities for OwnSpace browser extension

const STORAGE_KEYS = {
  WORKSPACES: 'workspaces',
  SETTINGS: 'settings',
  CALDAV: 'caldav'
};

export const DEFAULT_WORKSPACE = {
  id: crypto.randomUUID(),
  name: 'Добро пожаловать',
  background: { type: 'color', value: '#1a1a2e' },
  widgets: []
};

export async function getWorkspaces() {
  const result = await browser.storage.local.get(STORAGE_KEYS.WORKSPACES);
  return result[STORAGE_KEYS.WORKSPACES] || [DEFAULT_WORKSPACE];
}

export async function saveWorkspaces(workspaces) {
  await browser.storage.local.set({ [STORAGE_KEYS.WORKSPACES]: workspaces });
}

export async function getSettings() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || { theme: 'dark', masterPasswordHash: '' };
}

export async function saveSettings(settings) {
  await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

export async function getCalDAVCredentials() {
  const result = await browser.storage.local.get(STORAGE_KEYS.CALDAV);
  return result[STORAGE_KEYS.CALDAV] || null;
}

export async function saveCalDAVCredentials(creds) {
  await browser.storage.local.set({ [STORAGE_KEYS.CALDAV]: creds });
}

async function deriveKey(password) {
  const encoder = new TextEncoder();
  const salt = encoder.encode('ownspace-salt-v1');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function exportData(encrypted = false, password = null) {
  const workspaces = await getWorkspaces();
  const settings = await getSettings();
  const caldav = await getCalDAVCredentials();

  const data = { workspaces, settings: { theme: settings.theme }, caldav };

  if (encrypted && password) {
    const encoder = new TextEncoder();
    const dataStr = JSON.stringify(data);
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(dataStr)
    );
    return JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encryptedData)),
      encrypted: true
    });
  }

  return JSON.stringify(data, null, 2);
}

export async function importData(jsonString, password = null) {
  let data;

  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.encrypted && password) {
      const key = await deriveKey(password);
      const iv = new Uint8Array(parsed.iv);
      const encryptedData = new Uint8Array(parsed.data);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData
      );
      const decoder = new TextDecoder();
      data = JSON.parse(decoder.decode(decrypted));
    } else {
      data = parsed;
    }
  } catch (e) {
    throw new Error('Invalid import data');
  }

  if (data.workspaces) {
    await saveWorkspaces(data.workspaces);
  }
  if (data.settings) {
    await saveSettings({ ...await getSettings(), ...data.settings });
  }
  if (data.caldav) {
    await saveCalDAVCredentials(data.caldav);
  }
}