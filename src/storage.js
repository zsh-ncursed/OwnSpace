import { STORAGE_KEYS } from './utils/constants.js';

export const storage = {
  local: {
    getItem: async (key) => {
      if (typeof browser !== 'undefined' && browser.storage) {
        const result = await browser.storage.local.get(key);
        return result[key] ?? null;
      } else {
        const value = localStorage.getItem(key);
        if (!value) {
          return null;
        }
        try {
          return JSON.parse(value);
        } catch (e) {
          console.warn(`Failed to parse localStorage item ${key}:`, e);
          return null;
        }
      }
    },
    setItem: async (key, value) => {
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.set({ [key]: value });
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    },
    removeItem: async (key) => {
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.remove(key);
      } else {
        localStorage.removeItem(key);
      }
    },
  },
};

export async function getWorkspaces() {
  const result = await storage.local.getItem(STORAGE_KEYS.WORKSPACES);
  if (Array.isArray(result)) return result;
  return [];
}

export async function saveWorkspaces(workspaces) {
  await storage.local.setItem(STORAGE_KEYS.WORKSPACES, workspaces);
}

export async function getSettings() {
  const result = await storage.local.getItem(STORAGE_KEYS.SETTINGS);
  return result || { theme: 'dark', masterPasswordHash: '' };
}

export async function saveSettings(settings) {
  await storage.local.setItem(STORAGE_KEYS.SETTINGS, settings);
}

export async function saveCalDAVCredentials(creds) {
  await storage.local.setItem(STORAGE_KEYS.CALDAV, creds);
}

export async function getCalDAVCredentials() {
  const result = await storage.local.getItem(STORAGE_KEYS.CALDAV);
  return result || null;
}

export async function saveActiveWorkspaceId(id) {
  await storage.local.setItem(STORAGE_KEYS.ACTIVE_WORKSPACE, id);
}

export async function getActiveWorkspaceId() {
  const result = await storage.local.getItem(STORAGE_KEYS.ACTIVE_WORKSPACE);
  return result || null;
}
