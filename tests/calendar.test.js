import { describe, it, expect } from 'vitest';
import { migrateEvent, eventColor, advanceDate, isCustomRecurring } from '../src/widgets/calendar.js';

describe('migrateEvent', () => {
  it('returns null for falsy input', () => {
    expect(migrateEvent(null)).toBeNull();
  });

  it('passes through modern format', () => {
    const event = {
      id: '1',
      title: 'Test',
      date: '2026-07-15',
      time: '14:00',
    };
    const result = migrateEvent(event);
    expect(result.id).toBe('1');
    expect(result.date).toBe('2026-07-15');
    expect(result.time).toBe('14:00');
  });

  it('migrates legacy format', () => {
    const event = {
      id: '2',
      title: 'Legacy',
      year: 2026,
      month: 6,
      day: 15,
      time: '14:00',
    };
    const result = migrateEvent(event);
    expect(result.date).toBe('2026-07-15');
    expect(result.time).toBe('14:00');
  });

  it('migrates recurring config', () => {
    const event = {
      id: '3',
      title: 'Recurring',
      date: '2026-07-15',
      recurring: { type: 'weekly', interval: 1 },
    };
    const result = migrateEvent(event);
    expect(result.recurring).toEqual({ type: 'weekly', interval: 1 });
  });

  it('preserves CalDAV source', () => {
    const event = {
      id: '4',
      title: 'Caldav',
      date: '2026-07-15',
      source: 'caldav',
    };
    const result = migrateEvent(event);
    expect(result.source).toBe('caldav');
  });
});

describe('eventColor', () => {
  it('returns custom color when provided', () => {
    expect(eventColor('id', 0, '#ff0000')).toBe('#ff0000');
  });

  it('generates golden angle hue', () => {
    const color = eventColor('id', 3);
    expect(color).toMatch(/hsl\([\d.]+ 70% 58%\)/);
  });
});

describe('advanceDate', () => {
  it('advances daily', () => {
    const date = new Date(2026, 0, 1);
    advanceDate(date, 'daily', 1);
    expect(date.getDate()).toBe(2);
  });

  it('advances weekly', () => {
    const date = new Date(2026, 0, 1);
    advanceDate(date, 'weekly', 1);
    expect(date.getDate()).toBe(8);
  });

  it('advances monthly', () => {
    const date = new Date(2026, 0, 15);
    advanceDate(date, 'monthly', 1);
    expect(date.getMonth()).toBe(1);
  });

  it('advances yearly', () => {
    const date = new Date(2026, 0, 15);
    advanceDate(date, 'yearly', 1);
    expect(date.getFullYear()).toBe(2027);
  });

  it('advances with custom interval', () => {
    const date = new Date(2026, 0, 1);
    advanceDate(date, 'daily', 5);
    expect(date.getDate()).toBe(6);
  });
});

describe('isCustomRecurring', () => {
  it('returns falsy for null', () => {
    expect(isCustomRecurring(null)).toBeFalsy();
  });

  it('returns false for type none', () => {
    expect(isCustomRecurring({ type: 'none', interval: 1 })).toBe(false);
  });

  it('returns true for interval > 1', () => {
    expect(isCustomRecurring({ type: 'daily', interval: 3 })).toBe(true);
  });

  it('returns true for recurring with endDate', () => {
    expect(
      isCustomRecurring({ type: 'weekly', interval: 1, endDate: '2026-12-31' }),
    ).toBe(true);
  });

  it('returns false for simple recurring (interval=1, no endDate)', () => {
    expect(isCustomRecurring({ type: 'weekly', interval: 1 })).toBe(false);
  });
});
