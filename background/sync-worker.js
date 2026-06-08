// OwnSpace Background Script
// Handles CalDAV sync + extension-level behaviors (pin tab, new-tab override)

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
      console.log('[OwnSpace] pinned existing tab');
      return;
    }

    await browser.tabs.create({ url, pinned: true, active: false });
    console.log('[OwnSpace] created and pinned new tab');
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
    console.log(`[OwnSpace] redirected new tab ${targetUrl} -> ${ownUrl}`);
  } catch (e) {
    console.warn('[OwnSpace] could not redirect tab', e);
  }
}

browser.runtime.onStartup.addListener(() => {
  console.log('[OwnSpace] onStartup');
  ensurePinnedOwnSpaceTab();
});

browser.runtime.onInstalled.addListener(() => {
  console.log('[OwnSpace] onInstalled');
  ensurePinnedOwnSpaceTab();
});

browser.tabs.onCreated.addListener(maybeRedirectNewTab);

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'PIN_TAB_NOW') {
    ensurePinnedOwnSpaceTab();
  }
});

// CalDAV Sync

const CALDAV_OPERATIONS = {
  PROPFIND: 'PROPFIND',
  REPORT: 'REPORT',
  PUT: 'PUT',
  DELETE: 'DELETE'
};

class CalDAVClient {
  constructor(baseUrl, username, password) {
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

  async createEvent(calendarUrl, event) {
    const ics = serializeICS(event);
    const path = `${calendarUrl}${event.uid}.ics`;

    await this.request(CALDAV_OPERATIONS.PUT, path, ics);
  }

  async updateEvent(calendarUrl, event) {
    const ics = serializeICS(event);
    const path = `${calendarUrl}${event.uid}.ics`;

    await this.request(CALDAV_OPERATIONS.PUT, path, ics);
  }

  async deleteEvent(calendarUrl, eventUid) {
    const path = `${calendarUrl}${eventUid}.ics`;
    await this.request(CALDAV_OPERATIONS.DELETE, path);
  }
}

// ============================================
// iCalendar (ICS) helpers
// ============================================

function unfoldICS(lines) {
  const unfolded = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) {
      if (unfolded.length > 0) unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseICSProps(componentBlock) {
  const props = {};
  for (const line of componentBlock) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 1) continue;
    const propName = line.slice(0, colonIdx);
    const propValue = line.slice(colonIdx + 1);
    props[propName] = propValue;
  }
  return props;
}

function splitICSComponents(unfoldedLines) {
  const components = [];
  let current = null;
  for (const line of unfoldedLines) {
    if (line === 'BEGIN:VEVENT') {
      current = [];
    } else if (line === 'END:VEVENT' && current !== null) {
      components.push(current);
      current = null;
    } else if (current !== null) {
      current.push(line);
    }
  }
  return components;
}

function icsDateToAppFormat(raw) {
  // raw examples:
  //   "20240101"           (all-day DATE)
  //   "20240101T120000"    (local datetime)
  //   "20240101T120000Z"   (UTC datetime)
  //   "20240101T120000" with params like DTSTART;VALUE=DATE -> "20240101"

  // Strip timezone suffix if present
  const dateStr = raw.replace(/Z$/, '');
  if (dateStr.length === 8) {
    // All-day: YYYYMMDD
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    return { date: `${year}-${month}-${day}` };
  }
  if (dateStr.length === 15) {
    // Datetime: YYYYMMDDTHHMMSS
    // Strip timezone offset like +0300
    const cleaned = dateStr.replace(/[+-]\d{4}$/, '');
    const year = cleaned.slice(0, 4);
    const month = cleaned.slice(4, 6);
    const day = cleaned.slice(6, 8);
    const hour = cleaned.slice(9, 11);
    const min = cleaned.slice(11, 13);
    return { date: `${year}-${month}-${day}`, time: `${hour}:${min}` };
  }
  return { date: '1970-01-01' };
}

function icsDtValue(raw) {
  // "DTSTART;VALUE=DATE:20240101" -> propName = "DTSTART;VALUE=DATE", value = "20240101"
  const semicolonIdx = raw.indexOf(';');
  return semicolonIdx > 0 ? raw.slice(0, semicolonIdx) : raw;
}

function parseCalDAVEvents(icsData) {
  const unfolded = unfoldICS(icsData.split('\n'));
  const vevents = splitICSComponents(unfolded);
  const events = [];

  for (const block of vevents) {
    const props = parseICSProps(block);
    const uid = props.UID || '';
    const summary = props.SUMMARY || 'Без названия';

    // Find DTSTART and DTEND (might have params like "DTSTART;VALUE=DATE")
    let dtstartRaw = '', dtendRaw = '';
    let isAllDay = false;
    for (const key of Object.keys(props)) {
      const base = key.split(';')[0];
      if (base === 'DTSTART') { dtstartRaw = props[key]; if (key.includes('VALUE=DATE')) isAllDay = true; }
      if (base === 'DTEND') { dtendRaw = props[key]; }
    }

    if (!dtstartRaw) continue; // invalid event

    const start = icsDateToAppFormat(dtstartRaw);
    const end = dtendRaw ? icsDateToAppFormat(dtendRaw) : start;

    events.push({
      uid,
      title: summary,
      date: start.date,
      time: isAllDay ? undefined : (start.time || '00:00'),
      endDate: end.date,
      isAllDay,
      source: 'caldav'
    });
  }

  return events;
}

// Message handler from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload, id } = message;

  (async () => {
    try {
      let result;

      switch (type) {
        case 'configure':
          result = { success: true };
          break;

        case 'sync':
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

        case 'test':
          const { url: testUrl, username: testUser, password: testPass } = payload;
          const testClient = new CalDAVClient(testUrl, testUser, testPass);
          const calendars = await testClient.getCalendars();
          result = { calendars };
          break;

        case 'fetchTitle':
          console.log('[BG] fetchTitle received, url:', payload?.url);
          try {
            // Background page can fetch without CORS restrictions
            const response = await fetch(payload.url);
            console.log('[BG] fetch status:', response.status);
            if (response.ok) {
              const html = await response.text();
              const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
              console.log('[BG] title match:', match ? match[1] : null);
              result = { title: match ? match[1].trim() : null };
            } else {
              result = { title: null, error: 'HTTP ' + response.status };
            }
          } catch (e) {
            console.log('[BG] fetch error:', e.message);
            result = { title: null, error: e.message };
          }
          break;

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

console.log('OwnSpace background script loaded');