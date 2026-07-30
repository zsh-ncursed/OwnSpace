import { describe, it, expect } from 'vitest';
import {
  migrateEvent,
  eventColor,
  advanceDate,
  isCustomRecurring,
  generateRecurringEvents,
  calcMonthFinance,
} from '../src/widgets/calendar.js';

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

describe('generateRecurringEvents — money propagation', () => {
  it('copies moneyType and money into recurring instances', () => {
    const base = {
      id: 'base-1',
      title: 'Зарплата',
      date: '2026-07-01',
      time: '10:00',
      moneyType: 'income',
      money: 50000,
      recurring: { type: 'monthly', interval: 1 },
    };
    const instances = generateRecurringEvents(base, base.recurring);
    expect(instances.length).toBeGreaterThan(0);
    for (const inst of instances) {
      expect(inst.moneyType).toBe('income');
      expect(inst.money).toBe(50000);
      expect(inst.isRecurringInstance).toBe(true);
    }
  });

  it('preserves null money in recurring instances', () => {
    const base = {
      id: 'base-2',
      title: 'Встреча',
      date: '2026-07-01',
      time: null,
      moneyType: null,
      money: null,
      recurring: { type: 'weekly', interval: 1 },
    };
    const instances = generateRecurringEvents(base, base.recurring);
    for (const inst of instances) {
      expect(inst.moneyType).toBeNull();
      expect(inst.money).toBeNull();
    }
  });
});

describe('migrateEvent — money fields', () => {
  it('preserves income money fields', () => {
    const result = migrateEvent({
      id: '1', title: 'T', date: '2026-07-15',
      moneyType: 'income', money: 1000,
    });
    expect(result.moneyType).toBe('income');
    expect(result.money).toBe(1000);
  });

  it('preserves expense money fields', () => {
    const result = migrateEvent({
      id: '2', title: 'T', date: '2026-07-15',
      moneyType: 'expense', money: 500,
    });
    expect(result.moneyType).toBe('expense');
    expect(result.money).toBe(500);
  });

  it('drops invalid moneyType', () => {
    const result = migrateEvent({
      id: '3', title: 'T', date: '2026-07-15',
      moneyType: 'invalid', money: 100,
    });
    expect(result.moneyType).toBeUndefined();
  });
});

describe('calcMonthFinance', () => {
  // Fixed "now": 2026-07-20T12:00:00
  const NOW = new Date(2026, 6, 20, 12, 0, 0);

  it('returns zeros for empty events', () => {
    const r = calcMonthFinance([], NOW);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(0);
    expect(r.net).toBe(0);
    expect(r.hasMoney).toBe(false);
  });

  it('counts past income and expense events', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 3000 },
      { id: '2', date: '2026-07-10', time: '14:00', moneyType: 'expense', money: 1000 },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(3000);
    expect(r.expense).toBe(1000);
    expect(r.net).toBe(2000);
    expect(r.hasMoney).toBe(true);
  });

  it('counts all-day event on today (date <= today)', () => {
    const events = [
      { id: '1', date: '2026-07-20', time: null, moneyType: 'income', money: 500 },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(500);
  });

  it('excludes timed event on today that has not started yet', () => {
    // Event today at 18:00, now is 12:00 → not counted
    const events = [
      { id: '1', date: '2026-07-20', time: '18:00', moneyType: 'income', money: 2000 },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(0);
    expect(r.hasMoney).toBe(false);
  });

  it('counts timed event on today that has started', () => {
    // Event today at 10:00, now is 12:00 → counted
    const events = [
      { id: '1', date: '2026-07-20', time: '10:00', moneyType: 'income', money: 2000 },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(2000);
  });

  it('excludes future events (tomorrow+)', () => {
    const events = [
      { id: '1', date: '2026-07-21', time: '10:00', moneyType: 'income', money: 5000 },
      { id: '2', date: '2026-07-25', time: null, moneyType: 'expense', money: 500 },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(0);
  });

  it('counts recurring instances that have started', () => {
    // Daily recurring at 09:00 from July 1, each with money 100 income.
    const base = {
      id: 'base',
      title: 'T',
      date: '2026-07-01',
      time: '09:00',
      moneyType: 'income',
      money: 100,
    };
    const instances = generateRecurringEvents(base, { type: 'daily', interval: 1 });
    const all = [base, ...instances];
    const r = calcMonthFinance(all, NOW);
    // July 1..19 = 19 events × 100 = 1900 (July 20 at 09:00 also started → 20)
    expect(r.income).toBe(2000);
  });

  it('excludes CalDAV events', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 3000, source: 'caldav' },
      { id: '2', date: '2026-07-05', time: '10:00', moneyType: 'expense', money: 500, source: 'caldav' },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(0);
  });

  it('ignores events from other months', () => {
    const events = [
      { id: '1', date: '2026-06-30', time: '09:00', moneyType: 'income', money: 9999 },
      { id: '2', date: '2026-08-01', time: '09:00', moneyType: 'income', money: 9999 },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(0);
  });

  it('ignores zero/negative/non-number money', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 0 },
      { id: '2', date: '2026-07-05', time: '10:00', moneyType: 'income', money: -100 },
      { id: '3', date: '2026-07-05', time: '11:00', moneyType: 'income', money: 'not a number' },
      { id: '4', date: '2026-07-05', time: '12:00', moneyType: 'expense', money: 200 },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(200);
  });

  it('deleted events are excluded (simulated by not including them)', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 1000 },
      // event id=2 was deleted, simply absent from array
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.income).toBe(1000);
  });

  it('net is negative when expenses exceed income', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 500 },
      { id: '2', date: '2026-07-06', time: '10:00', moneyType: 'expense', money: 1500 },
    ];
    const r = calcMonthFinance(events, NOW);
    expect(r.net).toBe(-1000);
    expect(r.hasMoney).toBe(true);
  });
});
