// OwnSpace Background Service Worker (MV3)
// Handles CalDAV sync + extension-level behaviors (pin tab, new-tab override)
//
// Loaded as "background.service_worker" so it works in both Chrome and
// Firefox (121+). Classic script (no "type": "module") — Firefox does not
// support module background workers yet, so helpers are loaded via importScripts.

// webextension-polyfill: no-op in Firefox (native browser.*), wraps chrome.*
// into promise-based browser.* for Chrome.
importScripts('../lib/browser-polyfill.min.js');
// Shared iCalendar parsing helpers (also unit-tested in vitest).
importScripts('ics-parser.js');

const EXTENSION_DEFAULTS = {
  openInNewTabs: true,
  pinOwnSpaceTab: false
};

async function getExtensionSettings() {
  const result = await browser.storage.local.get('extensionSettings');
  return { ...EXTENSION_DEFAULTS, ...(result.extensionSettings || {}) };
}

function getOwnSpaceUrl() {
  return browser.runtime.getURL('newtab.html');
}

async function ensurePinnedOwnSpaceTab() {
  try {
    const settings = await getExtensionSettings();
    if (!settings.pinOwnSpaceTab) return;

    const url = getOwnSpaceUrl();
    const existing = await browser.tabs.query({ url });

    if (existing.length > 0) {
      for (const tab of existing) {
        if (!tab.pinned) {
          await browser.tabs.update(tab.id, { pinned: true });
        }
      }
      return;
    }

    await browser.tabs.create({ url, pinned: true, active: false });
  } catch (e) {
    console.warn('[OwnSpace] could not pin tab', e);
  }
}

async function maybeRedirectNewTab(tab) {
  try {
    const targetUrl = tab.pendingUrl || tab.url || '';
    const isNewTabPage =
      targetUrl === 'about:newtab' ||
      targetUrl === 'about:home' ||
      targetUrl.startsWith('floorp://') ||
      targetUrl.startsWith('chrome://newtab');

    if (!isNewTabPage) return;

    const settings = await getExtensionSettings();
    if (settings.openInNewTabs === false) return;

    const ownUrl = getOwnSpaceUrl();
    await browser.tabs.update(tab.id, { url: ownUrl });
  } catch (e) {
    console.warn('[OwnSpace] could not redirect tab', e);
  }
}

browser.runtime.onStartup.addListener(() => {
  ensurePinnedOwnSpaceTab();
});

browser.runtime.onInstalled.addListener(() => {
  ensurePinnedOwnSpaceTab();
});

browser.tabs.onCreated.addListener(maybeRedirectNewTab);

// CalDAV Sync

const CALDAV_OPERATIONS = {
  PROPFIND: 'PROPFIND',
  REPORT: 'REPORT',
  PUT: 'PUT',
  DELETE: 'DELETE'
};

class CalDAVClient {
  constructor(baseUrl, username, password) {
    if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
      throw new Error('CalDAV URL must be http(s)');
    }
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
  }

  async request(method, path, body = null, headers = {}) {
    const url = new URL(path, this.baseUrl).href;
    const auth = btoa(`${this.username}:${this.password}`);

    const options = {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1',
        ...headers
      }
    };

    if (body) {
      options.body = body;
    }

    const response = await fetch(url, options);
    const text = await response.text();
    return {
      status: response.status,
      text,
      xml: response.headers.get('Content-Type')?.includes('xml')
        ? new DOMParser().parseFromString(text, 'text/xml')
        : null
    };
  }

  async getCalendars() {
    const body = `<?xml version="1.0" encoding="utf-8" ?>
      <d:propfind xmlns:d="DAV:">
        <d:prop>
          <d:displayname />
          <d:resourcetype />
        </d:prop>
      </d:propfind>`;

    const response = await this.request(CALDAV_OPERATIONS.PROPFIND, '/', body);

    if (response.status !== 207) {
      throw new Error(`Failed to get calendars: ${response.status}`);
    }

    const calendars = [];
    const responses = response.xml.querySelectorAll('response');

    responses.forEach(res => {
      const resourceType = res.querySelector('resourcetype');
      const calendar = resourceType.querySelector('calendar');
      if (calendar) {
        const href = res.querySelector('href')?.textContent;
        const name = res.querySelector('displayname')?.textContent || 'Calendar';
        calendars.push({ href, name });
      }
    });

    return calendars;
  }

  async getEvents(calendarUrl, startDate, endDate) {
    const body = `<?xml version="1.0" encoding="utf-8" ?>
      <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:prop>
          <c:calendar-data />
        </d:prop>
        <c:filter>
          <c:comp-filter name="VCALENDAR">
            <c:time-range start="${startDate}" end="${endDate}" />
          </c:comp-filter>
        </c:filter>
      </c:calendar-query>`;

    const response = await this.request(CALDAV_OPERATIONS.REPORT, calendarUrl, body);

    if (response.status !== 207) {
      throw new Error(`Failed to get events: ${response.status}`);
    }

    const events = [];
    const responses = response.xml.querySelectorAll('response');

    responses.forEach(res => {
      const data = res.querySelector('calendar-data')?.textContent;
      if (data) {
        const parsed = parseCalDAVEvents(data);
        events.push(...parsed);
      }
    });

    return events;
  }

  async deleteEvent(calendarUrl, eventUid) {
    const path = `${calendarUrl}${eventUid}.ics`;
    await this.request(CALDAV_OPERATIONS.DELETE, path);
  }
}

// ============================================
// iCalendar (ICS) helpers — extracted to ics-parser.js
// (loaded via importScripts above; shared with unit tests)
// ============================================

const { parseCalDAVEvents } = OwnSpaceICS;

// Message handler from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload, id } = message;

  (async () => {
    try {
      let result;

      switch (type) {
        case 'PIN_TAB_NOW':
          ensurePinnedOwnSpaceTab();
          result = { success: true };
          break;

        case 'configure':
          result = { success: true };
          break;

        case 'sync': {
          const { url, username, password, calendarUrl } = payload;
          const client = new CalDAVClient(url, username, password);

          const now = new Date();
          const startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
            .toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
          const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
            .toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

          const events = await client.getEvents(calendarUrl, startDate, endDate);
          result = { events };
          break;
        }

        case 'test': {
          const { url: testUrl, username: testUser, password: testPass } = payload;
          const testClient = new CalDAVClient(testUrl, testUser, testPass);
          const calendars = await testClient.getCalendars();
          result = { calendars };
          break;
        }

        case 'fetchTitle': {
          const fetchUrl = payload?.url;
          // Defence-in-depth: only http/https URLs. The caller already validates
          // via new URL() + http(s) prefix, but the SW is a trust boundary —
          // never fetch an arbitrary string sent over a message.
          if (!fetchUrl || !/^https?:\/\//.test(fetchUrl)) {
            result = { title: null, error: 'invalid url' };
            break;
          }
          try {
            // Background SW fetches without CORS restrictions
            const response = await fetch(fetchUrl);
            if (response.ok) {
              const html = await response.text();
              const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
              result = { title: match ? match[1].trim() : null };
            } else {
              result = { title: null, error: 'HTTP ' + response.status };
            }
          } catch (e) {
            result = { title: null, error: e.message };
          }
          break;
        }

        default:
          throw new Error(`Unknown message type: ${type}`);
      }

      sendResponse({ id, success: true, result });
    } catch (error) {
      sendResponse({ id, success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

