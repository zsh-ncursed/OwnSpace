import { encryptJson, decryptJson } from './crypto.js';
import {
  getWorkspaces,
  saveWorkspaces,
  getSettings,
  saveSettings,
  getCalDAVCredentials,
  saveCalDAVCredentials,
} from './storage.js';

export async function exportData(encrypted = false, password = null) {
  const workspaces = await getWorkspaces();
  const settings = await getSettings();
  const caldav = await getCalDAVCredentials();
  const data = { workspaces, settings: { theme: settings.theme }, caldav };

  if (encrypted && password) {
    const enc = await encryptJson(JSON.stringify(data), password);
    return JSON.stringify({ iv: enc.iv, data: enc.data, encrypted: true });
  }
  return JSON.stringify(data, null, 2);
}

export async function importData(jsonString, password = null) {
  let data;
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.encrypted && password) {
      const dec = await decryptJson(
        { iv: parsed.iv, data: parsed.data },
        password,
      );
      data = JSON.parse(dec);
    } else {
      data = parsed;
    }
  } catch {
    throw new Error('Invalid import data');
  }
  if (data.workspaces) await saveWorkspaces(data.workspaces);
  if (data.settings)
    await saveSettings({ ...(await getSettings()), ...data.settings });
  if (data.caldav) await saveCalDAVCredentials(data.caldav);
}

export const browserMessaging = {
  sendMessage: async (message) => {
    if (typeof browser !== 'undefined' && browser?.runtime?.sendMessage) {
      try {
        return await browser.runtime.sendMessage(message);
      } catch (e) {
        console.error('[MSG] sendMessage failed:', e.message);
      }
    } else {
      console.warn('[MSG] browser.runtime not available');
    }

    if (message.type === 'test') {
      return { success: true, result: { events: [] } };
    }
    if (message.type === 'fetchTitle') {
      return {
        success: false,
        result: { title: null },
        error: 'Not in extension context',
      };
    }
    if (message.type === 'sync') {
      return { success: true, result: { events: [] } };
    }
    return { success: true };
  },
};
