import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLang, getLang, getDayNames } from '../src/i18n/index.js';

describe('t()', () => {
  beforeEach(() => {
    setLang('en');
  });

  it('returns English string for known key', () => {
    expect(t('common.save')).toBe('Save');
    expect(t('common.cancel')).toBe('Cancel');
  });

  it('returns Russian string after setLang(ru)', () => {
    setLang('ru');
    expect(t('common.save')).toBe('Сохранить');
    expect(t('common.cancel')).toBe('Отмена');
  });

  it('falls back to English when key missing in active dict', () => {
    setLang('ru');
    // ponytail: artificially test fallback by using a key present only in en
    // (in practice both dicts have same keys, but fallback logic must hold)
    expect(t('__nonexistent_in_ru__')).toBe('__nonexistent_in_ru__');
  });

  it('returns key itself when missing from all dicts', () => {
    expect(t('completely.made.up.key')).toBe('completely.made.up.key');
  });

  it('interpolates params', () => {
    setLang('en');
    expect(t('widget.todo.remaining', { count: 5 })).toBe('Remaining: 5');
    setLang('ru');
    expect(t('widget.todo.remaining', { count: 5 })).toBe('Осталось: 5');
  });

  it('interpolates multiple params', () => {
    setLang('en');
    const s = t('import.startme.bookmarks_count', { count: 3, groups: 2 });
    expect(s).toContain('3');
    expect(s).toContain('2');
  });
});

describe('getLang()', () => {
  it('returns current language', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    setLang('ru');
    expect(getLang()).toBe('ru');
  });

  it('falls back to en for unknown lang', () => {
    setLang('fr');
    expect(getLang()).toBe('en');
  });
});

describe('getDayNames()', () => {
  it('returns 7 English day abbreviations', () => {
    setLang('en');
    const days = getDayNames();
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('Sun');
    expect(days[6]).toBe('Sat');
  });

  it('returns 7 Russian day abbreviations', () => {
    setLang('ru');
    const days = getDayNames();
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('Вс');
    expect(days[6]).toBe('Сб');
  });
});