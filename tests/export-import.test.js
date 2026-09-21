import { describe, it, expect } from 'vitest';
import { decryptJson } from '../src/crypto.js';
import { exportData, importData } from '../src/export-import.js';
import { saveWorkspaces, getWorkspaces } from '../src/storage.js';

describe('encrypted export/import', () => {
  it('roundtrips encrypted data and preserves the salt field', async () => {
    const ws = [{ id: 'ws-1', name: 'Test', widgets: [] }];
    await saveWorkspaces(ws);

    const json = await exportData(true, 'pass123');
    const parsed = JSON.parse(json);
    expect(parsed.encrypted).toBe(true);
    expect(parsed.salt).toBeDefined();
    expect(parsed.salt).toHaveLength(16);
    expect(parsed.iv).toBeDefined();

    await importData(json, 'pass123');
    expect(await getWorkspaces()).toEqual([
      { id: 'ws-1', name: 'Test', widgets: [], background: { type: 'color', value: '#1a1a2e' } },
    ]);
  });

  it('encrypts the payload a single time (decrypts straight to the object)', async () => {
    const json = await exportData(true, 'pass123');
    const parsed = JSON.parse(json);
    const dec = await decryptJson(
      { salt: parsed.salt, iv: parsed.iv, data: parsed.data },
      'pass123',
    );
    // Not a double-encoded string: the plaintext is the export object itself.
    expect(dec).toHaveProperty('workspaces', expect.any(Array));
    expect(dec).toHaveProperty('settings', { theme: expect.any(String) });
    // caldav is null when nothing is configured — the key must exist regardless.
    expect('caldav' in dec).toBe(true);
  });

  it('rejects an encrypted file with a wrong password', async () => {
    const json = await exportData(true, 'right-pass');
    await expect(importData(json, 'wrong-pass')).rejects.toThrow(
      'Invalid import data',
    );
  });

  it('imports a legacy encrypted payload without a salt field', async () => {
    // Build a legacy-format payload the way pre-salt versions did: PBKDF2 with
    // the fixed 'ownspace-encryption-v1' salt and no salt embedded.
    const enc = new TextEncoder();
    const legacySalt = enc.encode('ownspace-encryption-v1');
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode('legacy-pass'),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: legacySalt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    // Legacy exportData (pre-simplification) called
    // encryptJson(JSON.stringify(data), ...) and encryptJson JSON.stringifies
    // its input again, so old payloads stored a DOUBLE-encoded string.
    // Replicate that exact shape — importData must still handle it.
    const plaintext = JSON.stringify({
      workspaces: [{ id: 'old-1', name: 'Legacy', widgets: [] }],
      settings: { theme: 'dark' },
    });
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify(plaintext)),
    );
    const legacyJson = JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(cipher)),
      encrypted: true,
    });

    await importData(legacyJson, 'legacy-pass');
    expect(await getWorkspaces()).toEqual([
      { id: 'old-1', name: 'Legacy', widgets: [], background: { type: 'color', value: '#1a1a2e' } },
    ]);
  });
});

describe('calendar events survive import', () => {
  // The classic bug: validateWidgetConfig used to rebuild calendar events with
  // only {id,title,date,time}, silently dropping color, money, and the whole
  // recurring rule — so a recurring event lost every future instance after
  // import, and finances stopped summing.
  const fullCalendarWorkspace = () => ({
    id: 'ws-cal',
    name: 'Cal',
    widgets: [
      {
        id: 'cal-1',
        type: 'calendar',
        column: 0,
        order: 0,
        pinned: false,
        config: {
          title: 'Мой календарь',
          showWeather: true,
          events: [
            {
              id: 'ev-base',
              title: 'Зарплата',
              date: '2026-01-05',
              time: '09:00',
              endTime: '18:00',
              color: '#5b6cff',
              money: 50000,
              moneyType: 'income',
              recurring: { type: 'monthly', interval: 1, endDate: '2027-01-05' },
            },
            {
              id: 'ev-inst',
              title: 'Зарплата',
              date: '2026-02-05',
              time: '09:00',
              isRecurringInstance: true,
              recurringParentId: 'ev-base',
              color: '#5b6cff',
              money: 50000,
              moneyType: 'income',
            },
            { id: 'ev-note', title: 'День рождения', date: '2026-03-11', time: '' },
          ],
        },
      },
    ],
  });

  it('preserves color, money, and recurring fields of events', async () => {
    await saveWorkspaces([]);

    await importData(JSON.stringify({ workspaces: [fullCalendarWorkspace()] }));
    const [ws] = await getWorkspaces();
    const cal = ws.widgets.find((w) => w.type === 'calendar');
    expect(cal.config.title).toBe('Мой календарь');
    expect(cal.config.showWeather).toBe(true);

    const base = cal.config.events.find((e) => e.id === 'ev-base');
    expect(base).toMatchObject({
      title: 'Зарплата',
      date: '2026-01-05',
      time: '09:00',
      endTime: '18:00',
      color: '#5b6cff',
      money: 50000,
      moneyType: 'income',
      recurring: { type: 'monthly', interval: 1, endDate: '2027-01-05' },
    });
  });

  it('preserves recurring-instance links and all-day events', async () => {
    await saveWorkspaces([]);

    await importData(JSON.stringify({ workspaces: [fullCalendarWorkspace()] }));
    const [ws] = await getWorkspaces();
    const cal = ws.widgets.find((w) => w.type === 'calendar');

    const inst = cal.config.events.find((e) => e.id === 'ev-inst');
    expect(inst).toMatchObject({
      isRecurringInstance: true,
      recurringParentId: 'ev-base',
      money: 50000,
      moneyType: 'income',
    });

    // An all-day event keeps time: null, not "" — the renderer keys on truthy
    // time to draw the event bar inside a day cell.
    const note = cal.config.events.find((e) => e.id === 'ev-note');
    expect(note.time).toBe(null);
  });

  it('roundtrips through export → import without losing event data', async () => {
    await saveWorkspaces([fullCalendarWorkspace()]);
    const json = await exportData(false, null);

    await saveWorkspaces([]);
    await importData(json);
    const [ws] = await getWorkspaces();
    const cal = ws.widgets.find((w) => w.type === 'calendar');
    expect(cal.config.events).toHaveLength(3);
    const base = cal.config.events.find((e) => e.id === 'ev-base');
    expect(base.recurring).toEqual({ type: 'monthly', interval: 1, endDate: '2027-01-05' });
    expect(base.money).toBe(50000);
    expect(cal.config.showWeather).toBe(true);
  });

  it('drops malformed recurring rules and money instead of keeping bad data', async () => {
    await saveWorkspaces([]);

    await importData(
      JSON.stringify({
        workspaces: [
          {
            id: 'ws-bad',
            name: 'Bad',
            widgets: [
              {
                id: 'cal-bad',
                type: 'calendar',
                config: {
                  events: [
                    {
                      id: 'e1',
                      title: 'x',
                      date: '2026-01-01',
                      recurring: { type: 'bogus', interval: -5 },
                      money: -100,
                      moneyType: 'nope',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );
    const [ws] = await getWorkspaces();
    const cal = ws.widgets.find((w) => w.type === 'calendar');
    const ev = cal.config.events[0];
    expect(ev.recurring).toBeUndefined();
    expect(ev.money).toBeUndefined();
    expect(ev.moneyType).toBeUndefined();
  });
});
