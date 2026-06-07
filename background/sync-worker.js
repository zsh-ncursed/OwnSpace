// CalDAV Sync Background Script
// Handles background synchronization with CalDAV servers

async function ensurePinnedOwnSpaceTab() {
  try {
    const result = await browser.storage.local.get('extensionSettings');
    const settings = (result.extensionSettings || {}).pinOwnSpaceTab;
    if (!settings) return;

    const url = browser.runtime.getURL('newtab.html');
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
    console.warn('OwnSpace: could not pin tab', e);
  }
}

browser.runtime.onStartup.addListener(ensurePinnedOwnSpaceTab);
browser.runtime.onInstalled.addListener(ensurePinnedOwnSpaceTab);

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
    return {
      status: response.status,
      text: await response.text(),
      xml: response.headers.get('Content-Type')?.includes('xml')
        ? new DOMParser().parseFromString(await response.text(), 'text/xml')
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
        events.push(parseICS(data));
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

function parseICS(icsData) {
  const event = {};
  const lines = icsData.split('\n');

  let currentProp = '';
  let currentValue = '';

  lines.forEach(line => {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      currentValue += line.substring(1);
      return;
    }

    if (currentProp) {
      event[currentProp] = currentValue.trim();
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      currentProp = line.substring(0, colonIndex);
      currentValue = line.substring(colonIndex + 1);
    }
  });

  if (currentProp) {
    event[currentProp] = currentValue.trim();
  }

  return event;
}

function serializeICS(event) {
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//OwnSpace//EN
BEGIN:VEVENT
UID:${event.uid || crypto.randomUUID()}
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART:${event.dtstart}
DTEND:${event.dtend}
SUMMARY:${event.summary || event.title || 'Event'}
END:VEVENT
END:VCALENDAR`;
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
          const startDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
          const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
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