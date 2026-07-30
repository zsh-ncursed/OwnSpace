import { escapeHtml } from '../ui/escape.js';
import { updateWidgetConfig } from './management.js';

export const WIDGET_TYPE = 'calculator';

const CALC_BUTTONS = [
  ['C', 'C', 'calc-clear'],
  ['±', 'negate', 'calc-negate'],
  ['%', '%', 'calc-percent'],
  ['÷', '/', 'calc-div'],
  ['7', '7', 'calc-7'],
  ['8', '8', 'calc-8'],
  ['9', '9', 'calc-9'],
  ['×', '*', 'calc-mul'],
  ['4', '4', 'calc-4'],
  ['5', '5', 'calc-5'],
  ['6', '6', 'calc-6'],
  ['−', '-', 'calc-minus'],
  ['1', '1', 'calc-1'],
  ['2', '2', 'calc-2'],
  ['3', '3', 'calc-3'],
  ['+', '+', 'calc-plus'],
  ['0', '0', 'calc-0'],
  ['.', '.', 'calc-dot'],
  ['=', '=', 'calc-equals'],
];

function formatCalcNumber(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  if (Math.abs(n) >= 1e12 || (Math.abs(n) > 0 && Math.abs(n) < 1e-9)) {
    return n.toExponential(6).replace(/\.?0+e/, 'e');
  }
  const rounded = Math.round(n * 1e10) / 1e10;
  let s = rounded.toString();
  if (s.length > 14) s = n.toPrecision(12).replace(/\.?0+$/, '');
  return s;
}

export function renderCalculatorWidget(widget) {
  const history = widget.config.history || [];
  const last = widget.config.last != null ? formatCalcNumber(widget.config.last) : '';
  const lastExpr = history.length > 0 ? history[history.length - 1].expr : '';

  return `
    <div class="calculator-widget" data-widget-id="${widget.id}" tabindex="0">
      <div class="calc-display">
        <div class="calc-history">${escapeHtml(lastExpr)}</div>
        <div class="calc-current" data-calc-current>0</div>
        ${last ? `<div class="calc-last" title="Последний результат">= ${escapeHtml(last)}</div>` : ''}
      </div>
      <div class="calc-keys">
        ${CALC_BUTTONS.map(([label, action, cls]) => {
          const wide = action === '0' ? ' calc-key-wide' : '';
          return `<button type="button" class="calc-key${wide} ${cls}" data-calc-action="${action}">${label}</button>`;
        }).join('')}
      </div>
    </div>
  `;
}

const calcState = new WeakMap();

function getCalcState(el) {
  if (!calcState.has(el)) {
    calcState.set(el, {
      current: '0',
      accumulator: null,
      operator: null,
      lastWasOperator: false,
      lastWasEquals: false,
    });
  }
  return calcState.get(el);
}

function calcApplyOp(acc, op, b, isPercent) {
  if (op === '+') return acc + (isPercent ? (acc * b) / 100 : b);
  if (op === '-') return acc - (isPercent ? (acc * b) / 100 : b);
  if (op === '*') return acc * (isPercent ? b / 100 : b);
  if (op === '/') return acc / (isPercent ? b / 100 : b);
  return b;
}

function calcInput(widget, el, st, key) {
  const display = el.querySelector('[data-calc-current]');
  const historyEl = el.querySelector('.calc-history');

  if (/^[0-9]$/.test(key)) {
    if (st.lastWasOperator || st.lastWasEquals || st.current === '0') {
      st.current = key === '0' && st.current === '0' ? '0' : key;
      if (st.lastWasOperator || st.lastWasEquals) st.current = key;
    } else {
      if (st.current.replace('-', '').length >= 14) return;
      st.current = st.current === '0' ? key : st.current + key;
    }
    st.lastWasOperator = false;
    st.lastWasEquals = false;
    display.textContent = st.current;
    return;
  }
  if (key === '.') {
    if (st.lastWasOperator || st.lastWasEquals) {
      st.current = '0.';
      st.lastWasOperator = false;
      st.lastWasEquals = false;
    } else if (!st.current.includes('.')) {
      st.current = (st.current || '0') + '.';
    }
    display.textContent = st.current;
    return;
  }
  if (key === '+' || key === '-' || key === '*' || key === '/') {
    const value = parseFloat(st.current);
    if (st.accumulator != null && st.operator && !st.lastWasOperator) {
      const result = calcApplyOp(st.accumulator, st.operator, value, false);
      st.accumulator = result;
      st.current = formatCalcNumber(result);
      display.textContent = st.current;
    } else {
      st.accumulator = value;
    }
    st.operator = key;
    st.lastWasOperator = true;
    st.lastWasEquals = false;
    if (historyEl) historyEl.textContent = `${formatCalcNumber(st.accumulator)} ${key}`;
    return;
  }
  if (key === '%') {
    if (st.accumulator == null || !st.operator) {
      const v = parseFloat(st.current) / 100;
      st.current = formatCalcNumber(v);
      st.lastWasOperator = false;
      display.textContent = st.current;
      return;
    }
    const value = parseFloat(st.current);
    const result = calcApplyOp(st.accumulator, st.operator, value, true);
    st.accumulator = result;
    st.current = formatCalcNumber(result);
    st.lastWasOperator = false;
    st.lastWasEquals = true;
    display.textContent = st.current;
    if (historyEl) historyEl.textContent = `${formatCalcNumber(result)}`;
    return;
  }
  if (key === '=' || key === 'Enter') {
    if (st.accumulator == null || !st.operator) return;
    const value = parseFloat(st.current);
    const result = calcApplyOp(st.accumulator, st.operator, value, false);
    const expr = `${formatCalcNumber(st.accumulator)} ${st.operator} ${formatCalcNumber(value)}`;
    const history = (widget.config.history || []).slice(-9);
    history.push({ expr, result });
    updateWidgetConfig(widget.id, { history, last: result }, true);
    st.accumulator = null;
    st.operator = null;
    st.current = formatCalcNumber(result);
    st.lastWasOperator = false;
    st.lastWasEquals = true;
    display.textContent = st.current;
    if (historyEl) historyEl.textContent = expr;
    return;
  }
  if (key === 'C' || key === 'Escape' || key === 'c') {
    st.current = '0';
    st.accumulator = null;
    st.operator = null;
    st.lastWasOperator = false;
    st.lastWasEquals = false;
    display.textContent = st.current;
    if (historyEl) historyEl.textContent = '';
    return;
  }
  if (key === 'negate') {
    if (st.current !== '0') {
      st.current = st.current.startsWith('-') ? st.current.slice(1) : '-' + st.current;
      display.textContent = st.current;
    }
    return;
  }
  if (key === 'Backspace') {
    if (st.lastWasOperator || st.lastWasEquals) return;
    st.current =
      st.current.length <= 1 || (st.current.length === 2 && st.current.startsWith('-'))
        ? '0'
        : st.current.slice(0, -1);
    display.textContent = st.current;
    return;
  }
}

export function setupCalculatorWidget(el, widget) {
  const st = getCalcState(el);

  const keyHandler = (e) => {
    const k = e.key;
    let mapped = null;
    if (/^[0-9]$/.test(k)) mapped = k;
    else if (k === '.' || k === ',') mapped = '.';
    else if (k === '+') mapped = '+';
    else if (k === '-') mapped = '-';
    else if (k === '*' || k === 'x' || k === 'X') mapped = '*';
    else if (k === '/') { e.preventDefault(); mapped = '/'; }
    else if (k === '%') mapped = '%';
    else if (k === 'Enter') { e.preventDefault(); mapped = '='; }
    else if (k === '=' ) mapped = '=';
    else if (k === 'Backspace') mapped = 'Backspace';
    else if (k === 'Escape') mapped = 'C';
    else if (k === 'c' || k === 'C') mapped = 'C';
    if (mapped == null) return;
    e.preventDefault();
    calcInput(widget, el, st, mapped);
  };
  el.addEventListener('keydown', keyHandler);

  el.querySelectorAll('.calc-key').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      el.focus();
      calcInput(widget, el, st, btn.dataset.calcAction);
    });
  });
}

export default {
  type: WIDGET_TYPE,
  title: 'Калькулятор',
  icon: 'calculator',
  defaultConfig: { history: [], last: null, title: 'Калькулятор' },
  render: renderCalculatorWidget,
  setup: setupCalculatorWidget,
};