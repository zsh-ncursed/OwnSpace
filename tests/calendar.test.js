import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  migrateEvent,
  eventColor,
  advanceDate,
  isCustomRecurring,
  generateRecurringEvents,
  upsertEventWithRecurring,
  calcMonthFinance,
  shiftMonth,
  deleteEvent,
  renderCalendarWidget,
} from '../src/widgets/calendar.js';
import {
  getCalendarView,
  setCalendarView,
  clearCalendarView,
  clearAllCalendarViews,
} from '../src/widgets/calendar-view.js';

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

  it('advances seconds', () => {
    const date = new Date(2026, 6, 15, 10, 30, 0);
    advanceDate(date, 'seconds', 90);
    expect(date.getSeconds()).toBe(30);
    expect(date.getMinutes()).toBe(31);
  });

  it('advances minutes', () => {
    const date = new Date(2026, 6, 15, 10, 30, 0);
    advanceDate(date, 'minutes', 45);
    expect(date.getMinutes()).toBe(15);
    expect(date.getHours()).toBe(11);
  });

  it('advances hours', () => {
    const date = new Date(2026, 6, 15, 10, 0, 0);
    advanceDate(date, 'hours', 6);
    expect(date.getHours()).toBe(16);
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

describe('upsertEventWithRecurring', () => {
  it('adds a new simple event', () => {
    const ev = { id: 'a', title: 'A', date: '2026-07-05' };
    const r = upsertEventWithRecurring([], ev);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('a');
  });

  it('replaces an existing event by id', () => {
    const events = [{ id: 'a', title: 'Old', date: '2026-07-05' }];
    const ev = { id: 'a', title: 'New', date: '2026-07-06' };
    const r = upsertEventWithRecurring(events, ev);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual(ev);
  });

  it('does not mutate the input array', () => {
    const events = [{ id: 'a', title: 'A', date: '2026-07-05' }];
    upsertEventWithRecurring(events, {
      id: 'b',
      title: 'B',
      date: '2026-07-06',
    });
    expect(events).toHaveLength(1);
  });

  it('regenerates instances and drops stale ones on edit', () => {
    const base = {
      id: 'base',
      title: 'T',
      date: '2026-07-01',
      time: '09:00',
      recurring: { type: 'daily', interval: 1 },
    };
    const first = upsertEventWithRecurring([], base);
    const before = first.length;

    const edited = { ...base, title: 'Edited' };
    const second = upsertEventWithRecurring(first, edited);

    expect(second.filter((e) => e.title === 'T')).toHaveLength(0);
    expect(second.filter((e) => e.title === 'Edited')).toHaveLength(before);
    expect(second).toHaveLength(before);
  });

  it('removes instances when recurrence is cancelled', () => {
    const base = {
      id: 'base',
      title: 'T',
      date: '2026-07-01',
      time: '09:00',
      recurring: { type: 'daily', interval: 1 },
    };
    const first = upsertEventWithRecurring([], base);

    const nonRecurring = {
      id: 'base',
      title: 'T',
      date: '2026-07-01',
      time: '09:00',
    };
    const second = upsertEventWithRecurring(first, nonRecurring);
    expect(second).toHaveLength(1);
    expect(second[0].recurring).toBeUndefined();
  });

  it('does not drop instances of other series', () => {
    const baseA = {
      id: 'a',
      title: 'A',
      date: '2026-07-01',
      time: '09:00',
      recurring: { type: 'daily', interval: 1 },
    };
    const baseB = {
      id: 'b',
      title: 'B',
      date: '2026-07-01',
      time: '10:00',
      recurring: { type: 'daily', interval: 1 },
    };
    const first = upsertEventWithRecurring(
      upsertEventWithRecurring([], baseA),
      baseB,
    );
    const editedA = { ...baseA, title: 'A2' };
    const second = upsertEventWithRecurring(first, editedA);
    expect(second.filter((e) => e.recurringParentId === 'b').length).toBeGreaterThan(0);
  });
});

describe('calcMonthFinance', () => {
  // Fixed "now": 2026-07-20T12:00:00
  const NOW = new Date(2026, 6, 20, 12, 0, 0);

  it('returns zeros for empty events', () => {
    const r = calcMonthFinance([], 2026, 6, NOW);
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
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.income).toBe(3000);
    expect(r.expense).toBe(1000);
    expect(r.net).toBe(2000);
    expect(r.hasMoney).toBe(true);
  });

  it('counts all-day event on today (date <= today)', () => {
    const events = [
      { id: '1', date: '2026-07-20', time: null, moneyType: 'income', money: 500 },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.income).toBe(500);
  });

  it('counts timed event on today that has started', () => {
    // Event today at 10:00, now is 12:00 → counted
    const events = [
      { id: '1', date: '2026-07-20', time: '10:00', moneyType: 'income', money: 2000 },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.income).toBe(2000);
  });

  it('excludes future events (tomorrow+)', () => {
    const events = [
      { id: '1', date: '2026-07-21', time: '10:00', moneyType: 'income', money: 5000 },
      { id: '2', date: '2026-07-25', time: null, moneyType: 'expense', money: 500 },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
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
    const r = calcMonthFinance(all, 2026, 6, NOW);
    // July 1..19 = 19 events × 100 = 1900 (July 20 at 09:00 also started → 20)
    expect(r.income).toBe(2000);
  });

  it('excludes CalDAV events', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 3000, source: 'caldav' },
      { id: '2', date: '2026-07-05', time: '10:00', moneyType: 'expense', money: 500, source: 'caldav' },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(0);
  });

  it('filters by viewed month: june events viewed in july are past', () => {
    const events = [
      { id: '1', date: '2026-06-30', time: '09:00', moneyType: 'income', money: 9999 },
    ];
    // viewing June — past month, all count
    const r = calcMonthFinance(events, 2026, 5, NOW);
    expect(r.income).toBe(9999);
  });

  it('filters by viewed month: august events viewed in july are future', () => {
    const events = [
      { id: '1', date: '2026-08-01', time: '09:00', moneyType: 'income', money: 9999 },
    ];
    // viewing August — future month, none count
    const r = calcMonthFinance(events, 2026, 7, NOW);
    expect(r.income).toBe(0);
  });

  it('ignores zero/negative/non-number money', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 0 },
      { id: '2', date: '2026-07-05', time: '10:00', moneyType: 'income', money: -100 },
      { id: '3', date: '2026-07-05', time: '11:00', moneyType: 'income', money: 'not a number' },
      { id: '4', date: '2026-07-05', time: '12:00', moneyType: 'expense', money: 200 },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(200);
  });

  it('deleted events are excluded (simulated by not including them)', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 1000 },
      // event id=2 was deleted, simply absent from array
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.income).toBe(1000);
  });

  it('net is negative when expenses exceed income', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: 'income', money: 500 },
      { id: '2', date: '2026-07-06', time: '10:00', moneyType: 'expense', money: 1500 },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.net).toBe(-1000);
    expect(r.hasMoney).toBe(true);
  });

  it('hides block when all money events are future (not started)', () => {
    // Event tomorrow with money — not counted, block hidden
    const events = [
      { id: '1', date: '2026-07-21', time: '10:00', moneyType: 'income', money: 5000 },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(0);
    expect(r.net).toBe(0);
    expect(r.hasMoney).toBe(false);
  });

  it('hides block when timed event today has not started yet', () => {
    // Event today at 18:00, now is 12:00 — not counted, block hidden
    const events = [
      { id: '1', date: '2026-07-20', time: '18:00', moneyType: 'income', money: 2000 },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.income).toBe(0);
    expect(r.hasMoney).toBe(false);
  });

  it('hasMoney=false when no events have money at all', () => {
    const events = [
      { id: '1', date: '2026-07-05', time: '09:00', moneyType: null, money: null },
      { id: '2', date: '2026-07-06', time: '10:00' },
    ];
    const r = calcMonthFinance(events, 2026, 6, NOW);
    expect(r.hasMoney).toBe(false);
  });

  it('past month: counts all events regardless of started status', () => {
    // Viewed: June 2026, NOW: July 20. All June events are past.
    const events = [
      { id: '1', date: '2026-06-30', time: '23:59', moneyType: 'income', money: 1000 },
      { id: '2', date: '2026-06-01', time: '00:01', moneyType: 'expense', money: 200 },
    ];
    const r = calcMonthFinance(events, 2026, 5, NOW);
    expect(r.income).toBe(1000);
    expect(r.expense).toBe(200);
    expect(r.net).toBe(800);
    expect(r.hasMoney).toBe(true);
  });

  it('future month: counts nothing (no events started yet)', () => {
    // Viewed: August 2026, NOW: July 20. All August events are future.
    const events = [
      { id: '1', date: '2026-08-01', time: '09:00', moneyType: 'income', money: 5000 },
      { id: '2', date: '2026-08-31', time: null, moneyType: 'expense', money: 1000 },
    ];
    const r = calcMonthFinance(events, 2026, 7, NOW);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(0);
    expect(r.hasMoney).toBe(false);
  });

  it('past month: recurring instances all count', () => {
    // Daily recurring at 09:00 from June 1 with money 100 income.
    const base = {
      id: 'base',
      title: 'T',
      date: '2026-06-01',
      time: '09:00',
      moneyType: 'income',
      money: 100,
    };
    const instances = generateRecurringEvents(base, { type: 'daily', interval: 1 });
    const all = [base, ...instances].filter((e) => e.date.startsWith('2026-06'));
    const r = calcMonthFinance(all, 2026, 5, NOW);
    expect(r.income).toBe(100 * all.length);
    expect(r.hasMoney).toBe(true);
  });
});

describe('shiftMonth', () => {
  it('goes to previous month', () => {
    expect(shiftMonth(2026, 6, -1)).toEqual({ viewYear: 2026, viewMonth: 5, selectedDay: null });
  });

  it('wraps from January to December of previous year', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ viewYear: 2025, viewMonth: 11, selectedDay: null });
  });

  it('goes to next month', () => {
    expect(shiftMonth(2026, 6, 1)).toEqual({ viewYear: 2026, viewMonth: 7, selectedDay: null });
  });

  it('wraps from December to January of next year', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ viewYear: 2027, viewMonth: 0, selectedDay: null });
  });

  it('always resets selectedDay', () => {
    expect(shiftMonth(2026, 5, -1).selectedDay).toBeNull();
    expect(shiftMonth(2026, 5, 1).selectedDay).toBeNull();
  });
});

describe('deleteEvent', () => {
  it('deletes a single non-recurring event', () => {
    const events = [
      { id: 'a', title: 'A', date: '2026-07-01' },
      { id: 'b', title: 'B', date: '2026-07-02' },
    ];
    const result = deleteEvent(events, 'a', false);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('deletes only one instance when choice is not "all"', () => {
    const events = [
      { id: 'base', title: 'Base', date: '2026-07-01', recurring: { type: 'daily', interval: 1 } },
      { id: 'inst1', title: 'Base', date: '2026-07-02', isRecurringInstance: true, recurringParentId: 'base' },
      { id: 'inst2', title: 'Base', date: '2026-07-03', isRecurringInstance: true, recurringParentId: 'base' },
    ];
    const result = deleteEvent(events, 'inst1', true, 'one');
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.id === 'inst1')).toBeUndefined();
  });

  it('deletes entire series when choice is "all" and event is the base', () => {
    const events = [
      { id: 'base', title: 'Base', date: '2026-07-01', recurring: { type: 'daily', interval: 1 } },
      { id: 'inst1', title: 'Base', date: '2026-07-02', isRecurringInstance: true, recurringParentId: 'base' },
      { id: 'inst2', title: 'Base', date: '2026-07-03', isRecurringInstance: true, recurringParentId: 'base' },
    ];
    const result = deleteEvent(events, 'base', true, 'all');
    expect(result).toHaveLength(0);
  });

  it('deletes entire series when event is an instance (uses recurringParentId)', () => {
    const events = [
      { id: 'base', title: 'Base', date: '2026-07-01', recurring: { type: 'daily', interval: 1 } },
      { id: 'inst1', title: 'Base', date: '2026-07-02', isRecurringInstance: true, recurringParentId: 'base' },
      { id: 'inst2', title: 'Base', date: '2026-07-03', isRecurringInstance: true, recurringParentId: 'base' },
    ];
    const result = deleteEvent(events, 'inst1', true, 'all');
    expect(result).toHaveLength(0);
  });

  it('no-op for unknown id', () => {
    const events = [{ id: 'a', title: 'A', date: '2026-07-01' }];
    const result = deleteEvent(events, '999', false);
    expect(result).toHaveLength(1);
  });
});

describe('calendar view state (ephemeral, per-tab)', () => {
  beforeEach(() => {
    clearAllCalendarViews();
  });

  it('defaults to the current month for an untouched widget', () => {
    const now = new Date(2026, 8, 17);
    expect(getCalendarView('w1', now)).toEqual({
      viewYear: 2026,
      viewMonth: 8,
      selectedDay: null,
    });
  });

  it('recomputes "current" on every call, so a long-lived tab rolls over', () => {
    expect(getCalendarView('w1', new Date(2026, 11, 31)).viewMonth).toBe(11);
    expect(getCalendarView('w1', new Date(2027, 0, 1))).toEqual({
      viewYear: 2027,
      viewMonth: 0,
      selectedDay: null,
    });
  });

  it('remembers navigation within the tab', () => {
    const now = new Date(2026, 8, 17);
    setCalendarView('w1', shiftMonth(2026, 8, -1));
    expect(getCalendarView('w1', now)).toEqual({
      viewYear: 2026,
      viewMonth: 7,
      selectedDay: null,
    });
  });

  it('keeps views of separate widgets independent', () => {
    const now = new Date(2026, 8, 17);
    setCalendarView('w1', { viewYear: 2020, viewMonth: 0 });
    expect(getCalendarView('w2', now).viewMonth).toBe(8);
  });

  it('merges partial updates instead of replacing the view', () => {
    const now = new Date(2026, 8, 17);
    setCalendarView('w1', { selectedDay: 5 });
    expect(getCalendarView('w1', now)).toEqual({
      viewYear: 2026,
      viewMonth: 8,
      selectedDay: 5,
    });
  });

  it('returns copies so callers cannot mutate stored state', () => {
    setCalendarView('w1', { selectedDay: 5 });
    const view = getCalendarView('w1');
    view.selectedDay = 99;
    expect(getCalendarView('w1').selectedDay).toBe(5);
  });

  it('clearCalendarView resets that widget back to the current month', () => {
    const now = new Date(2026, 8, 17);
    setCalendarView('w1', { viewYear: 2020, viewMonth: 0, selectedDay: 3 });
    clearCalendarView('w1');
    expect(getCalendarView('w1', now)).toEqual({
      viewYear: 2026,
      viewMonth: 8,
      selectedDay: null,
    });
  });
});

describe('renderCalendarWidget month header', () => {
  beforeEach(() => {
    clearAllCalendarViews();
    vi.stubGlobal('ICONS', {
      action: (name) => `<svg data-icon="${name}"></svg>`,
      btn: (name) => `<svg data-icon="${name}"></svg>`,
    });
  });

  const title = (html) => html.match(/class="calendar-title">([^<]*)</)[1].trim();

  it('renders the current month even when config carries stale legacy view keys', () => {
    const now = new Date();
    const expected = `${new Date(now.getFullYear(), now.getMonth(), 1)
      .toLocaleString('en', { month: 'long' })} ${now.getFullYear()}`;
    // Legacy persisted state — must be ignored by the renderer.
    const html = renderCalendarWidget({
      id: 'cal-legacy',
      config: { events: [], viewYear: 2020, viewMonth: 3, selectedDay: 11 },
    });
    expect(title(html)).toBe(expected);
    expect((html.match(/calendar-day today/g) || []).length).toBe(1);
  });

  it('follows in-tab navigation', () => {
    setCalendarView('cal-nav', { viewYear: 2026, viewMonth: 0 });
    const html = renderCalendarWidget({ id: 'cal-nav', config: { events: [] } });
    expect(title(html)).toBe('January 2026');
    // Not the current month → no "today" cell highlighted.
    expect(html).not.toContain('calendar-day today');
  });
});

