import { describe, it, expect } from 'vitest';
// Side-effect import: ics-parser.js is a classic script (no exports) that
// attaches its helpers to globalThis.OwnSpaceICS. Same mechanism the
// background service worker uses via importScripts('ics-parser.js').
import '../background/ics-parser.js';

const ICS = globalThis.OwnSpaceICS;

describe('unfoldICS', () => {
  it('joins folded continuation lines (RFC 5545: CRLF+space is removed)', () => {
    const lines = ['SUMMARY:Very long', ' subject', 'END:VEVENT'];
    expect(ICS.unfoldICS(lines)).toEqual(['SUMMARY:Very longsubject', 'END:VEVENT']);
  });

  it('strips trailing CR', () => {
    const lines = ['BEGIN:VEVENT\r', 'END:VEVENT\r'];
    expect(ICS.unfoldICS(lines)).toEqual(['BEGIN:VEVENT', 'END:VEVENT']);
  });
});

describe('parseICSProps', () => {
  it('parses plain props', () => {
    const props = ICS.parseICSProps(['UID:abc-123', 'SUMMARY:Team meeting']);
    expect(props.UID).toBe('abc-123');
    expect(props.SUMMARY).toBe('Team meeting');
  });

  it('keeps property params in the key (DTSTART;VALUE=DATE)', () => {
    const props = ICS.parseICSProps(['DTSTART;VALUE=DATE:20240101']);
    expect(props['DTSTART;VALUE=DATE']).toBe('20240101');
  });

  it('skips malformed lines', () => {
    const props = ICS.parseICSProps([':novalue', 'no colon here']);
    expect(Object.keys(props)).toHaveLength(0);
  });
});

describe('splitICSComponents', () => {
  it('splits VEVENT blocks', () => {
    const lines = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:1',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:2',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    const comps = ICS.splitICSComponents(lines);
    expect(comps).toHaveLength(2);
    expect(comps[0]).toContain('UID:1');
    expect(comps[1]).toContain('UID:2');
  });

  it('returns empty array when no VEVENTs', () => {
    expect(ICS.splitICSComponents(['BEGIN:VCALENDAR', 'END:VCALENDAR'])).toEqual([]);
  });
});

describe('icsDateToAppFormat', () => {
  it('parses all-day DATE (YYYYMMDD)', () => {
    expect(ICS.icsDateToAppFormat('20240101')).toEqual({ date: '2024-01-01' });
  });

  it('parses local datetime (YYYYMMDDTHHMMSS)', () => {
    expect(ICS.icsDateToAppFormat('20240101T120000')).toEqual({
      date: '2024-01-01',
      time: '12:00',
    });
  });

  it('parses UTC datetime with Z suffix', () => {
    expect(ICS.icsDateToAppFormat('20240101T120000Z')).toEqual({
      date: '2024-01-01',
      time: '12:00',
    });
  });

  it('parses datetime with positive UTC offset (+HHMM)', () => {
    // Regression: previously fell through to 1970-01-01
    expect(ICS.icsDateToAppFormat('20240101T120000+0300')).toEqual({
      date: '2024-01-01',
      time: '12:00',
    });
  });

  it('parses datetime with negative UTC offset (-HHMM)', () => {
    expect(ICS.icsDateToAppFormat('20240101T180000-0500')).toEqual({
      date: '2024-01-01',
      time: '18:00',
    });
  });

  it('falls back to 1970-01-01 for unparseable input', () => {
    expect(ICS.icsDateToAppFormat('garbage')).toEqual({ date: '1970-01-01' });
  });
});

describe('parseCalDAVEvents', () => {
  const ICS_DATA = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OwnSpace//EN',
    'BEGIN:VEVENT',
    'UID:evt-1',
    'DTSTART;VALUE=DATE:20240115',
    'SUMMARY:All-day event',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt-2',
    'DTSTART:20240116T100000Z',
    'DTEND:20240116T110000Z',
    'SUMMARY:Timed UTC event',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt-3',
    'DTSTART:20240117T090000+0300',
    'SUMMARY:Offset event',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt-4',
    'DTSTART:20240118T083000',
    'SUMMARY:Folded',
    'DESCRIPTION:Very long descr',
    ' iption here',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  it('parses all-day events without time', () => {
    const events = ICS.parseCalDAVEvents(ICS_DATA);
    const ev = events.find((e) => e.uid === 'evt-1');
    expect(ev).toMatchObject({
      date: '2024-01-15',
      title: 'All-day event',
      isAllDay: true,
      source: 'caldav',
    });
    expect(ev.time).toBeUndefined();
  });

  it('parses UTC datetime events (Z suffix)', () => {
    const events = ICS.parseCalDAVEvents(ICS_DATA);
    const ev = events.find((e) => e.uid === 'evt-2');
    expect(ev).toMatchObject({ date: '2024-01-16', time: '10:00', endDate: '2024-01-16' });
  });

  it('parses events with numeric UTC offset (regression)', () => {
    const events = ICS.parseCalDAVEvents(ICS_DATA);
    const ev = events.find((e) => e.uid === 'evt-3');
    expect(ev).toMatchObject({ date: '2024-01-17', time: '09:00' });
  });

  it('unfolds folded lines and parses local times', () => {
    const events = ICS.parseCalDAVEvents(ICS_DATA);
    const ev = events.find((e) => e.uid === 'evt-4');
    expect(ev).toMatchObject({ date: '2024-01-18', time: '08:30' });
  });

  it('skips VEVENTs without DTSTART', () => {
    const data = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:x',
      'SUMMARY:No date',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    expect(ICS.parseCalDAVEvents(data)).toEqual([]);
  });
});
