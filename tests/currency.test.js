import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatRate,
  computeCrossRate,
  validateCurrencyPair,
  addCurrencyPair,
  removeCurrencyPair,
  fetchExchangeRates,
  renderCurrencyWidget,
  MAX_PAIRS,
  formatTime,
} from '../src/widgets/currency.js';

function stubIcons() {
  vi.stubGlobal('ICONS', {
    action: (name) => `<svg data-icon="${name}"></svg>`,
    btn: (name) => `<svg data-icon="${name}"></svg>`,
  });
}

describe('formatRate', () => {
  it('formats large rates without decimals', () => {
    expect(formatRate(82000)).toBe('82000');
    expect(formatRate(1000)).toBe('1000');
  });

  it('formats rates >= 1 with up to 2 decimals', () => {
    expect(formatRate(75)).toBe('75');
    expect(formatRate(82.5)).toBe('82.5');
    expect(formatRate(82.56)).toBe('82.56');
    expect(formatRate(1)).toBe('1');
  });

  it('trims trailing zeros', () => {
    expect(formatRate(75.0)).toBe('75');
    expect(formatRate(82.5)).toBe('82.5');
  });

  it('formats small rates with more precision', () => {
    expect(formatRate(0.0121)).toBe('0.0121');
    expect(formatRate(0.0007)).toBe('0.0007');
    expect(formatRate(0.92)).toBe('0.92');
  });

  it('handles non-finite values', () => {
    expect(formatRate(NaN)).toBe('—');
    expect(formatRate(Infinity)).toBe('—');
    expect(formatRate(null)).toBe('—');
    expect(formatRate('12')).toBe('—');
  });
});

describe('computeCrossRate', () => {
  it('computes quote-valued-in-base from USD-hub table', () => {
    const rates = { USD: 1, RUB: 82.5, EUR: 0.92 };
    expect(computeCrossRate('RUB', 'USD', rates)).toBeCloseTo(82.5);
    expect(computeCrossRate('RUB', 'EUR', rates)).toBeCloseTo(89.673913);
    expect(computeCrossRate('USD', 'EUR', rates)).toBeCloseTo(1.086956);
  });

  it('returns null for missing currencies', () => {
    expect(computeCrossRate('RUB', 'XXX', { RUB: 82.5 })).toBeNull();
    expect(computeCrossRate('XXX', 'USD', { USD: 1 })).toBeNull();
  });

  it('returns null for missing or zero quote rate', () => {
    expect(computeCrossRate('RUB', 'USD', null)).toBeNull();
    expect(computeCrossRate('RUB', 'USD', { RUB: 82.5, USD: 0 })).toBeNull();
  });
});

describe('validateCurrencyPair', () => {
  const pairs = [
    { id: '1', base: 'RUB', quote: 'USD' },
    { id: '2', base: 'USD', quote: 'EUR' },
  ];

  it('accepts a valid new pair', () => {
    expect(validateCurrencyPair(pairs, 'RUB', 'EUR')).toBeNull();
  });

  it('rejects empty selection', () => {
    expect(validateCurrencyPair(pairs, '', 'USD')).toBe('empty');
    expect(validateCurrencyPair(pairs, 'RUB', ' ')).toBe('empty');
  });

  it('rejects identical currencies', () => {
    expect(validateCurrencyPair(pairs, 'RUB', 'rub')).toBe('same');
  });

  it('rejects duplicate pair', () => {
    expect(validateCurrencyPair(pairs, 'rub', 'usd')).toBe('duplicate');
  });

  it('rejects more than MAX_PAIRS', () => {
    const full = Array.from({ length: MAX_PAIRS }, (_, i) => ({
      id: String(i),
      base: 'AAA' + i,
      quote: 'BBB' + i,
    }));
    expect(validateCurrencyPair(full, 'RUB', 'USD')).toBe('max');
  });

  it('normalizes case', () => {
    expect(validateCurrencyPair([], 'rub', 'usd')).toBeNull();
  });
});

describe('addCurrencyPair / removeCurrencyPair', () => {
  it('adds a normalized pair with id', () => {
    const res = addCurrencyPair([], 'rub', 'usd');
    expect(res.error).toBeUndefined();
    expect(res.pair.base).toBe('RUB');
    expect(res.pair.quote).toBe('USD');
    expect(res.pair.id).toBeTruthy();
  });

  it('returns error object on invalid pair', () => {
    expect(addCurrencyPair([], 'RUB', 'RUB').error).toBe('same');
    expect(addCurrencyPair([], 'RUB', '').error).toBe('empty');
  });

  it('removes a pair by id', () => {
    const pairs = [
      { id: 'a', base: 'RUB', quote: 'USD' },
      { id: 'b', base: 'USD', quote: 'EUR' },
    ];
    expect(removeCurrencyPair(pairs, 'a')).toHaveLength(1);
    expect(removeCurrencyPair(pairs, 'a')[0].id).toBe('b');
    expect(removeCurrencyPair(pairs, 'zzz')).toHaveLength(2);
  });

  it('does not mutate the original array', () => {
    const pairs = [{ id: 'a', base: 'RUB', quote: 'USD' }];
    removeCurrencyPair(pairs, 'a');
    expect(pairs).toHaveLength(1);
  });
});

describe('fetchExchangeRates', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('computes cross-rates from provider payload', async () => {
    const payload = {
      result: 'success',
      rates: { USD: 1, RUB: 82.5, EUR: 0.92 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    }));

    const pairs = [
      { id: 'a', base: 'RUB', quote: 'USD' },
      { id: 'b', base: 'RUB', quote: 'EUR' },
    ];
    const rates = await fetchExchangeRates(pairs);
    expect(rates.a.value).toBeCloseTo(82.5);
    expect(rates.b.value).toBeCloseTo(89.673913);
    expect(rates.a.base).toBe('RUB');
    expect(rates.a.quote).toBe('USD');
    expect(rates.a.updatedAt).toBeTypeOf('number');
  });

  it('marks unknown currency pairs as errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', rates: { USD: 1 } }),
    }));
    const rates = await fetchExchangeRates([{ id: 'x', base: 'RUB', quote: 'XXX' }]);
    expect(rates.x.error).toBe(true);
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));
    await expect(fetchExchangeRates([{ id: 'a', base: 'RUB', quote: 'USD' }]))
      .rejects.toThrow('HTTP 500');
  });

  it('throws when provider reports failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'error', 'error-type': 'invalid-key' }),
    }));
    await expect(fetchExchangeRates([{ id: 'a', base: 'RUB', quote: 'USD' }]))
      .rejects.toThrow('invalid-key');
  });
});

describe('formatTime', () => {
  it('formats timestamp as HH:MM', () => {
    const d = new Date(2026, 7, 12, 9, 5);
    expect(formatTime(d.getTime())).toBe('09:05');
  });

  it('returns empty string for invalid timestamp', () => {
    expect(formatTime(NaN)).toBe('');
  });
});

describe('renderCurrencyWidget', () => {
  beforeEach(() => {
    stubIcons();
  });

  it('shows empty hint when no pairs', () => {
    const html = renderCurrencyWidget({ id: 'w1', config: { pairs: [], rates: {} } });
    expect(html).toContain('currency-empty');
    expect(html).toContain('currency-base-select');
    expect(html).toContain('currency-quote-select');
  });

  it('renders a pair row with cached rate', () => {
    const widget = {
      id: 'w1',
      config: {
        pairs: [{ id: 'p1', base: 'RUB', quote: 'USD' }],
        rates: { p1: { value: 82.5, base: 'RUB', quote: 'USD', updatedAt: 1 } },
        lastUpdated: 1,
      },
    };
    const html = renderCurrencyWidget(widget);
    expect(html).toContain('USD/RUB');
    expect(html).toContain('82.5');
    expect(html).toContain('data-pair-id="p1"');
    expect(html).toContain('currency-refresh-btn');
  });

  it('renders placeholder for pair without a rate yet', () => {
    const widget = {
      id: 'w1',
      config: {
        pairs: [{ id: 'p1', base: 'RUB', quote: 'USD' }],
        rates: {},
      },
    };
    expect(renderCurrencyWidget(widget)).toContain('>—<');
  });

  it('renders all currency options in selects', () => {
    const html = renderCurrencyWidget({ id: 'w1', config: { pairs: [], rates: {} } });
    for (const code of ['RUB', 'USD', 'EUR', 'JPY', 'CNY', 'GBP']) {
      expect(html).toContain(`<option value="${code}">`);
    }
    expect(html).toContain('<option value="RUB" selected');
    expect(html).toContain('<option value="USD" selected');
  });

  it('shows max-pairs hint and disables add form when full', () => {
    const pairs = Array.from({ length: MAX_PAIRS }, (_, i) => ({
      id: 'p' + i,
      base: 'AAA',
      quote: 'BBB' + i,
    }));
    const html = renderCurrencyWidget({ id: 'w1', config: { pairs, rates: {} } });
    expect(html).toContain('currency-max-hint');
    expect(html).toContain('currency-add-row');
    expect(html).toContain('<select class="currency-base-select" data-currency-base aria-label="Base currency" title="Base currency" disabled>');
    expect(html).toContain('<button class="currency-add-btn icon-btn" title="Add" aria-label="Add" disabled>');
  });
});
