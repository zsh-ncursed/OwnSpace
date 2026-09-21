import { encryptJson, decryptJson } from './crypto.js';
import {
  getWorkspaces,
  saveWorkspaces,
  getSettings,
  saveSettings,
  getCalDAVCredentials,
  saveCalDAVCredentials,
} from './storage.js';
import { safeUrl } from './ui/escape.js';

const MAX_IMPORT_SIZE = 10 * 1024 * 1024; // 10 MiB — quota DoS guard
const MAX_WORKSPACES = 10;
const MAX_WIDGETS_PER_WORKSPACE = 50;
const MAX_BOOKMARKS_PER_WIDGET = 200;
const MAX_EVENTS_PER_WIDGET = 1000;

// Validate and sanitize an imported workspace object. Returns a safe copy or
// throws. This is the security boundary for importData: any untrusted JSON from
// a file/export must pass here before touching storage.
function validateWorkspaces(raw) {
  if (!Array.isArray(raw)) throw new Error('Invalid workspaces: not an array');
  if (raw.length > MAX_WORKSPACES) throw new Error('Too many workspaces');
  return raw.map((ws, i) => {
    if (!ws || typeof ws !== 'object') throw new Error(`Workspace ${i} invalid`);
    if (typeof ws.id !== 'string') throw new Error(`Workspace ${i} missing id`);
    if (typeof ws.name !== 'string') throw new Error(`Workspace ${i} missing name`);
    const widgets = Array.isArray(ws.widgets) ? ws.widgets : [];
    if (widgets.length > MAX_WIDGETS_PER_WORKSPACE)
      throw new Error(`Workspace ${i} has too many widgets`);
    return {
      id: ws.id,
      name: ws.name,
      background: validateBackground(ws.background),
      widgets: widgets.map((w, j) => validateWidget(w, i, j)),
    };
  });
}

function validateBackground(bg) {
  if (!bg || typeof bg !== 'object') return { type: 'color', value: '#1a1a2e' };
  const out = { type: bg.type || 'color', value: '' };
  if (bg.type === 'image') {
    const url = safeUrl(bg.value);
    out.value = url || '';
  } else if (bg.type === 'gradient') {
    out.value = typeof bg.value === 'string' ? bg.value : '';
  } else {
    out.type = 'color';
    out.value = typeof bg.value === 'string' ? bg.value : '#1a1a2e';
  }
  return out;
}

function validateWidget(w, wi, i) {
  if (!w || typeof w !== 'object') throw new Error(`Widget ${wi}.${i} invalid`);
  if (typeof w.id !== 'string') throw new Error(`Widget ${wi}.${i} missing id`);
  if (typeof w.type !== 'string') throw new Error(`Widget ${wi}.${i} missing type`);
  const config = w.config && typeof w.config === 'object' ? w.config : {};
  const safeConfig = validateWidgetConfig(w.type, config, wi, i);
  return {
    id: w.id,
    type: w.type,
    column: typeof w.column === 'number' ? w.column : 0,
    order: typeof w.order === 'number' ? w.order : i,
    pinned: Boolean(w.pinned),
    config: safeConfig,
  };
}

function validateWidgetConfig(type, config, wi, i) {
  const out = {};
  if (type === 'bookmarks' && Array.isArray(config.bookmarks)) {
    if (config.bookmarks.length > MAX_BOOKMARKS_PER_WIDGET)
      throw new Error(`Workspace ${wi} bookmark widget has too many bookmarks`);
    out.bookmarks = config.bookmarks.map((b, k) => {
      if (!b || typeof b !== 'object') throw new Error(`Bookmark ${wi}.${i}.${k} invalid`);
      const url = typeof b.url === 'string' ? safeUrl(b.url) || '' : '';
      return {
        id: typeof b.id === 'string' ? b.id : String(k),
        title: typeof b.title === 'string' ? b.title : '',
        url,
        favicon: typeof b.favicon === 'string' ? safeUrl(b.favicon) || '' : '',
      };
    });
  }
  if (type === 'weather') {
    out.city = typeof config.city === 'string' ? config.city : 'Moscow';
    out.apiKey = typeof config.apiKey === 'string' ? config.apiKey : '';
    out.title = typeof config.title === 'string' ? config.title : '';
  }
  if (type === 'calendar' && Array.isArray(config.events)) {
    if (config.events.length > MAX_EVENTS_PER_WIDGET)
      throw new Error(`Workspace ${wi} calendar has too many events`);
    out.events = config.events.map((e, k) => {
      if (!e || typeof e !== 'object') throw new Error(`Event ${wi}.${i}.${k} invalid`);
      // Keep the whole event model — color, money, and the recurring fields are
      // what make events render the same after import: drop `recurring` and the
      // generated instances would vanish, drop `recurringParentId` and they
      // would lose their link to the base event.
      const ev = {
        id: typeof e.id === 'string' ? e.id : String(k),
        title: typeof e.title === 'string' ? e.title : '',
        date: typeof e.date === 'string' ? e.date : '',
        time: typeof e.time === 'string' && e.time ? e.time : null,
      };
      // endTime / endDate: a timed event can span past midnight
      if (typeof e.endTime === 'string' && e.endTime) ev.endTime = e.endTime;
      if (typeof e.endDate === 'string' && e.endDate) ev.endDate = e.endDate;
      if (typeof e.color === 'string' && e.color) ev.color = e.color;
      // money: financial events (income/expense) summed by calcMonthFinance
      if (typeof e.money === 'number' && isFinite(e.money) && e.money > 0) {
        ev.money = e.money;
        if (e.moneyType === 'income' || e.moneyType === 'expense') ev.moneyType = e.moneyType;
      }
      // recurring: only the base event carries the rule; instances carry ids
      if (e.recurring && typeof e.recurring === 'object') {
        const recType = e.recurring.type;
        if (
          recType &&
          ['seconds', 'minutes', 'hours', 'daily', 'weekly', 'monthly', 'yearly'].includes(recType)
        ) {
          ev.recurring = {
            type: recType,
            interval: Number.isInteger(e.recurring.interval) && e.recurring.interval > 0
              ? e.recurring.interval
              : 1,
            endDate: typeof e.recurring.endDate === 'string' ? e.recurring.endDate : '',
          };
        }
      }
      if (typeof e.recurringParentId === 'string') {
        ev.isRecurringInstance = true;
        ev.recurringParentId = e.recurringParentId;
      }
      if (e.source === 'caldav') ev.source = 'caldav';
      return ev;
    });
  }
  if (typeof config.title === 'string') out.title = config.title;
  // Calendar: keeps the weather strip toggle alongside its events.
  if (type === 'calendar') out.showWeather = Boolean(config.showWeather);
  return out;
}

function validateSettings(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  if (raw.theme === 'dark' || raw.theme === 'light') out.theme = raw.theme;
  if (typeof raw.masterPasswordHash === 'object') out.masterPasswordHash = raw.masterPasswordHash;
  return out;
}

function validateCalDAV(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.url !== 'string' || typeof raw.username !== 'string') return null;
  const url = safeUrl(raw.url);
  if (!url) return null;
  return {
    url,
    username: raw.username,
    password: typeof raw.password === 'string' ? raw.password : '',
  };
}

export async function exportData(encrypted = false, password = null) {
  const workspaces = await getWorkspaces();
  const settings = await getSettings();
  const caldav = await getCalDAVCredentials();
  const data = { workspaces, settings: { theme: settings.theme }, caldav };

  if (encrypted && password) {
    // encryptJson JSON.stringifies internally — no double-encoding here.
    const enc = await encryptJson(data, password);
    return JSON.stringify({
      salt: enc.salt,
      iv: enc.iv,
      data: enc.data,
      encrypted: true,
    });
  }
  return JSON.stringify(data, null, 2);
}

export async function importData(jsonString, password = null) {
  if (typeof jsonString !== 'string' || jsonString.length > MAX_IMPORT_SIZE) {
    throw new Error('Import too large');
  }
  let data;
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.encrypted && password) {
      const dec = await decryptJson(
        { salt: parsed.salt, iv: parsed.iv, data: parsed.data },
        password,
      );
      // decryptJson already JSON.parses the plaintext once. New exports decrypt
      // straight to the object; legacy pre-simplification exports were double-
      // encoded (a string of a string) and need one more parse.
      data = typeof dec === 'string' ? JSON.parse(dec) : dec;
    } else {
      data = parsed;
    }
  } catch {
    throw new Error('Invalid import data');
  }

  // Validate and sanitize before touching storage.
  if (data.workspaces) {
    const safeWs = validateWorkspaces(data.workspaces);
    await saveWorkspaces(safeWs);
  }
  if (data.settings) {
    const safeSettings = validateSettings(data.settings);
    if (safeSettings) {
      await saveSettings({ ...(await getSettings()), ...safeSettings });
    }
  }
  if (data.caldav) {
    const safeCaldav = validateCalDAV(data.caldav);
    if (safeCaldav) await saveCalDAVCredentials(safeCaldav);
  }
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
