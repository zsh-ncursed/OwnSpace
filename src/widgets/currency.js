import { t } from '../i18n/index.js';

export const WIDGET_TYPE = 'currency';

export const MAX_PAIRS = 5;
export const REFRESH_INTERVAL = 10 * 60 * 1000;

// Currency codes offered in the dropdowns (display order, most common first).
// All are present in the provider's rates table.
export const CURRENCIES = [
  'RUB', 'USD', 'EUR', 'GBP', 'CNY',
  'JPY', 'CHF', 'CAD', 'AUD', 'NZD',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
  'HUF', 'RON', 'BGN', 'TRY', 'UAH',
  'KZT', 'BYN', 'GEL', 'AMD', 'AZN',
  'KGS', 'TJS', 'UZS', 'MDL', 'INR',
  'PKR', 'BDT', 'IDR', 'MYR', 'SGD',
  'THB', 'VND', 'PHP', 'KRW', 'HKD',
  'TWD', 'BRL', 'MXN', 'ARS', 'CLP',
  'COP', 'PEN', 'UYU', 'ZAR', 'EGP',
  'MAD', 'NGN', 'KES', 'AED', 'SAR',
  'QAR', 'ILS', 'JOD', 'KWD', 'BHD',
  'OMR',
];

// ExchangeRate-API free endpoint: no API key, CORS enabled, ~160 currencies,
// updated daily. A single USD-hub request yields every cross-rate, so up to
// MAX_PAIRS pairs cost one fetch per refresh.
// Docs: https://www.exchangerate-api.com/docs/free
export const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest/USD';

export function getCurrencyName(code) {
  return t(`currency.${code}`);
}

export function formatRate(rate) {
  if (typeof rate !== 'number' || !isFinite(rate)) return '—';
  if (rate >= 1000) return Math.round(rate).toString();
  if (rate >= 1) return trimZeros(rate.toFixed(2));
  const decimals = Math.min(6, Math.max(2, 2 - Math.floor(Math.log10(rate))));
  return trimZeros(rate.toFixed(decimals));
}

function trimZeros(s) {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// A pair is { base, quote }: base is the currency in which the quote currency
// is valued. For { base: 'RUB', quote: 'USD' } the rate reads "1 USD = N RUB".
export function validateCurrencyPair(pairs, base, quote) {
  const b = String(base || '').trim().toUpperCase();
  const q = String(quote || '').trim().toUpperCase();
  if (!b || !q) return 'empty';
  if (b === q) return 'same';
  if (pairs.some((p) => p.base === b && p.quote === q)) return 'duplicate';
  if (pairs.length >= MAX_PAIRS) return 'max';
  return null;
}

export function addCurrencyPair(pairs, base, quote) {
  const error = validateCurrencyPair(pairs, base, quote);
  if (error) return { error };
  return {
    pair: {
      id: crypto.randomUUID(),
      base: String(base || '').trim().toUpperCase(),
      quote: String(quote || '').trim().toUpperCase(),
    },
  };
}

export function removeCurrencyPair(pairs, pairId) {
  return pairs.filter((p) => p.id !== pairId);
}

// Cross-rate from a USD-hub rates table: rate(base, quote) = rates[base] / rates[quote].
export function computeCrossRate(base, quote, rates) {
  if (!rates) return null;
  if (typeof rates[base] !== 'number' || typeof rates[quote] !== 'number') {
    return null;
  }
  if (rates[quote] === 0) return null;
  return rates[base] / rates[quote];
}

export async function fetchExchangeRates(pairs) {
  const response = await fetch(EXCHANGE_RATE_API);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.result !== 'success' || !data.rates) {
    throw new Error(data['error-type'] || 'API error');
  }
  const rates = data.rates;
  const result = {};
  for (const p of pairs) {
    const value = computeCrossRate(p.base, p.quote, rates);
    result[p.id] =
      value != null
        ? { value, base: p.base, quote: p.quote, updatedAt: Date.now() }
        : { error: true, base: p.base, quote: p.quote, updatedAt: Date.now() };
  }
  return result;
}

export function renderCurrencyWidget(widget) {
  const pairs = widget.config.pairs || [];
  const rates = widget.config.rates || {};
  const lastUpdated = widget.config.lastUpdated;

  const listHtml = pairs.length
    ? pairs.map((p) => renderPairRow(p, rates[p.id])).join('')
    : `<div class="currency-empty">${t('widget.currency.empty')}</div>`;

  const atMax = pairs.length >= MAX_PAIRS;
  const maxHint = atMax
    ? `<div class="currency-max-hint">${t('widget.currency.max_pairs')}</div>`
    : '';

  const updatedHtml =
    lastUpdated && pairs.length
      ? `<span class="currency-updated" data-currency-updated>${t('widget.currency.updated_at', {
          time: formatTime(lastUpdated),
        })}</span>`
      : '';

  return `
    <div class="currency-widget" data-widget-id="${widget.id}">
      <div class="currency-list">${listHtml}</div>
      ${maxHint}
      ${renderAddRow(atMax)}
      <div class="currency-footer">
        ${updatedHtml}
        <span class="currency-status" data-currency-status></span>
        <button class="currency-refresh-btn icon-btn" title="${t('widget.currency.refresh')}" aria-label="${t('widget.currency.refresh')}">${ICONS.action('rotate-cw')}</button>
      </div>
    </div>
  `;
}

function renderPairRow(pair, rate) {
  const value = rate && !rate.error ? formatRate(rate.value) : '—';
  const title =
    rate && !rate.error
      ? `1 ${pair.quote} = ${formatRate(rate.value)} ${pair.base}`
      : `${pair.quote}/${pair.base}`;
  return `
    <div class="currency-pair" data-pair-id="${pair.id}">
      <span class="currency-pair-code" title="${title}">${pair.quote}/${pair.base}</span>
      <span class="currency-pair-value" data-currency-value="${pair.id}">
        <span class="currency-pair-num" data-currency-num="${pair.id}">${value}</span>
        <span class="currency-pair-unit">${pair.base}</span>
      </span>
      <button class="currency-remove-btn icon-btn" data-pair-id="${pair.id}" title="${t('common.delete')}" aria-label="${t('common.delete')}">${ICONS.action('x')}</button>
    </div>
  `;
}

function renderAddRow(disabled) {
  const options = CURRENCIES.map(
    (code) => `<option value="${code}">${code} — ${getCurrencyName(code)}</option>`,
  ).join('');
  const baseOptions = options.replace('<option value="RUB"', '<option value="RUB" selected');
  const quoteOptions = options.replace('<option value="USD"', '<option value="USD" selected');
  const dis = disabled ? ' disabled' : '';
  return `
    <div class="currency-add-row">
      <select class="currency-base-select" data-currency-base aria-label="${t('widget.currency.base_label')}" title="${t('widget.currency.base_label')}"${dis}>${baseOptions}</select>
      <span class="currency-slash">→</span>
      <select class="currency-quote-select" data-currency-quote aria-label="${t('widget.currency.quote_label')}" title="${t('widget.currency.quote_label')}"${dis}>${quoteOptions}</select>
      <button class="currency-add-btn icon-btn" title="${t('common.add')}" aria-label="${t('common.add')}"${dis}>${ICONS.btn('plus')}</button>
    </div>
  `;
}

export function formatTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Update only the rate numbers in the DOM after a fetch — no full grid re-render.
export function renderRatesInto(el, pairs, rates, lastUpdated) {
  for (const p of pairs) {
    const numEl = el.querySelector(`[data-currency-num="${p.id}"]`);
    if (!numEl) continue;
    const rate = rates[p.id];
    numEl.textContent = rate && !rate.error ? formatRate(rate.value) : '—';
  }
  const updatedEl = el.querySelector('[data-currency-updated]');
  if (updatedEl) {
    const ts = lastUpdated || Date.now();
    updatedEl.textContent = t('widget.currency.updated_at', { time: formatTime(ts) });
  }
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.currency.title',
  icon: 'arrow-down-up',
  defaultConfig: { pairs: [], rates: {}, lastUpdated: null, title: '' },
  render: renderCurrencyWidget,
};
