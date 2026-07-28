import { describe, it, expect } from 'vitest';
import { pad2, eventDateKey, localDateStr, timeAgo } from '../src/utils/date.js';

describe('pad2', () => {
  it('pads single digit with zero', () => {
    expect(pad2(1)).toBe('01');
    expect(pad2(9)).toBe('09');
  });

  it('does not pad double digits', () => {
    expect(pad2(10)).toBe('10');
    expect(pad2(99)).toBe('99');
  });
});

describe('eventDateKey', () => {
  it('formats date key correctly', () => {
    expect(eventDateKey(2026, 7, 15)).toBe('2026-08-15');
  });

  it('pads month and day', () => {
    expect(eventDateKey(2026, 0, 1)).toBe('2026-01-01');
  });
});

describe('localDateStr', () => {
  it('formats Date to YYYY-MM-DD', () => {
    expect(localDateStr(new Date(2026, 6, 15))).toBe('2026-07-15');
  });
});

describe('timeAgo', () => {
  it('returns empty for falsy input', () => {
    expect(timeAgo('')).toBe('');
    expect(timeAgo(null)).toBe('');
    expect(timeAgo(undefined)).toBe('');
  });

  it('shows "только что" for recent time', () => {
    const recent = new Date(Date.now() - 30000).toISOString();
    expect(timeAgo(recent)).toBe('только что');
  });

  it('shows minutes', () => {
    const fiveMin = new Date(Date.now() - 5 * 60000).toISOString();
    expect(timeAgo(fiveMin)).toBe('5 мин назад');
  });

  it('shows hours', () => {
    const threeHours = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(timeAgo(threeHours)).toBe('3 ч назад');
  });

  it('shows days', () => {
    const twoDays = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(timeAgo(twoDays)).toBe('2 дн назад');
  });
});
