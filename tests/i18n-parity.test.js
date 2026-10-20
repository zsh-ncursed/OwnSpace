import { describe, it, expect } from 'vitest';
import en from '../src/i18n/en.js';
import ru from '../src/i18n/ru.js';

// The dictionaries are plain JS objects, not browser.i18n message files, so
// nothing at build time catches a key that exists in one language and not the
// other. When that happens t() returns the key itself, and the user sees
// "sync.paste_from_clipboard" in the middle of the Russian UI. This test is
// the guard against that.

describe('i18n dictionary parity', () => {
  const enKeys = Object.keys(en);
  const ruKeys = Object.keys(ru);

  it('has the same number of keys in both languages', () => {
    expect(enKeys.length).toBe(ruKeys.length);
  });

  it('has no key that only exists in English', () => {
    const onlyEn = enKeys.filter((k) => !ruKeys.includes(k));
    expect(onlyEn).toEqual([]);
  });

  it('has no key that only exists in Russian', () => {
    const onlyRu = ruKeys.filter((k) => !enKeys.includes(k));
    expect(onlyRu).toEqual([]);
  });

  it('has no empty translation in either language', () => {
    const empty = [];
    for (const k of enKeys) {
      if (typeof en[k] !== 'string' || !en[k].trim()) empty.push(`en:${k}`);
    }
    for (const k of ruKeys) {
      if (typeof ru[k] !== 'string' || !ru[k].trim()) empty.push(`ru:${k}`);
    }
    expect(empty).toEqual([]);
  });

  it('uses the same placeholders in both languages', () => {
    // A {name} in English but not in Russian means the parameter is silently
    // dropped (or printed literally) in one of the two languages.
    const placeholders = (s) => (s.match(/\{[^}]+\}/g) || []).sort();
    const mismatched = [];
    for (const k of enKeys) {
      if (!(k in ru)) continue;
      const a = placeholders(en[k]).join(',');
      const b = placeholders(ru[k]).join(',');
      if (a !== b) mismatched.push(`${k}: en[${a}] vs ru[${b}]`);
    }
    expect(mismatched).toEqual([]);
  });
});
