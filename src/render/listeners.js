import { getActiveWorkspace } from '../state.js';
import { saveWorkspaces } from '../storage.js';
import {
  persistBookmarkOrder,
  setColumnSortablesDisabled,
  setBookmarkSortablesDisabled,
  persistWidgetLayoutFromGrid,
  sortableInstances,
  widgetSortableInstances,
} from '../sortable.js';
import { updateWidgetConfig, removeWidget, addWidget } from '../widgets/management.js';
import { widgetRegistry } from '../widgets/registry.js';
import { renderWidgetGrid, renderWidget } from './grid.js';
import { showConfirm } from '../ui/modals.js';
import { showWidgetSettingsModal } from '../widgets/event-modal.js';
import {
  renderRatesInto,
  fetchExchangeRates,
  REFRESH_INTERVAL,
} from '../widgets/currency.js';
import { state } from '../state.js';
import { t } from '../i18n/index.js';

// ponytail: single ticker for all datetime widgets — survives re-renders,
// skips detached nodes (querySelector finds none); replaces per-render setInterval leak.
let _datetimeTicker = null;
function ensureDatetimeTicker() {
  if (_datetimeTicker) return;
  _datetimeTicker = setInterval(() => {
    document.querySelectorAll('.datetime-widget').forEach((el) => {
      if (!el.isConnected) return;
      updateDateTime(el);
    });
  }, 30000);
}

// ponytail: re-render only one widget card instead of the whole grid.
// Preserves focus/scroll in all other widgets. Re-binds listeners for the card.
export function renderSingleWidget(widgetId) {
  const oldEl = document.querySelector(`.widget[data-widget-id="${CSS.escape(widgetId)}"]`);
  if (!oldEl || !oldEl.isConnected) {
    renderWidgetGrid();
    return;
  }
  const workspace = getActiveWorkspace();
  const widget = workspace?.widgets.find((w) => w.id === widgetId);
  if (!widget) {
    renderWidgetGrid();
    return;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = renderWidget(widget);
  const newEl = tmp.firstElementChild;
  oldEl.replaceWith(newEl);
  // Re-bind listeners for just this card. setupWidgetListeners() already wires
  // the calculator (and every other widget type) via querySelectorAll, so we
  // must NOT call setupCalculatorWidget() again here — that double-binds
  // keydown/click handlers (every keystroke would fire twice).
  setupWidgetListeners(newEl);
  ensureDatetimeTicker();
}

export function setupWidgetListeners(container) {
  // Dispatch each widget element to its plugin's own mount() handler. This
  // keeps per-widget interaction logic inside the widget module instead of in
  // this god-object (see widget registry dispatch in grid.js / setupWidgetGrid).
  container.querySelectorAll('.widget').forEach((el) => {
    const widgetId = el.dataset.widgetId;
    if (!widgetId) return;
    const widget = getActiveWorkspace()?.widgets.find((w) => w.id === widgetId);
    if (!widget) return;
    const plugin = widgetRegistry.get(widget.type);
    if (plugin && typeof plugin.mount === 'function') {
      try {
        plugin.mount(el, widget);
      } catch (err) {
        console.error('[OwnSpace] widget mount failed for', widget.type, err);
      }
    }
  });

  ensureCurrencyTicker();
  ensureDatetimeTicker();
}

export async function refreshCurrencyWidget(widget, el, { force = false } = {}) {
  const pairs = widget.config.pairs || [];
  const status = el.querySelector('[data-currency-status]');
  if (!pairs.length) {
    if (status) status.textContent = '';
    return;
  }
  const now = Date.now();
  const last = widget.config.lastUpdated || 0;
  if (!force && now - last < REFRESH_INTERVAL) {
    renderRatesInto(el, pairs, widget.config.rates || {}, last);
    return;
  }
  if (status) status.textContent = t('common.loading');
  delete status?.dataset.state;
  try {
    const newRates = await fetchExchangeRates(pairs);
    const merged = { ...(widget.config.rates || {}), ...newRates };
    const updatedAt = Date.now();
    updateWidgetConfig(widget.id, { rates: merged, lastUpdated: updatedAt }, true);
    renderRatesInto(el, pairs, merged, updatedAt);
    if (status) status.textContent = '';
  } catch (e) {
    if (status) {
      status.textContent = t('widget.currency.error_prefix', { message: e.message });
      status.dataset.state = 'error';
    }
  }
}

// single ticker: refreshes all connected currency widgets periodically
// without full grid re-renders.
let _currencyTicker = null;
function ensureCurrencyTicker() {
  if (_currencyTicker) return;
  _currencyTicker = setInterval(() => {
    document.querySelectorAll('.currency-widget').forEach((el) => {
      if (!el.isConnected) return;
      const widgetId = el.dataset.widgetId;
      const workspace = getActiveWorkspace();
      const widget = workspace?.widgets.find((w) => w.id === widgetId);
      if (widget && (widget.config.pairs || []).length) {
        refreshCurrencyWidget(widget, el);
      }
    });
  }, REFRESH_INTERVAL);
}

export function updateDateTime(el) {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  const dateEl = el.querySelector('.date');
  const timeEl = el.querySelector('.time');
  if (dateEl) dateEl.textContent = `${day}.${month}.${year}`;
  if (timeEl) timeEl.textContent = `${hours}:${minutes}`;
}

export function toggleWidgetPin(widgetId) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;
  const widget = workspace.widgets.find((w) => w.id === widgetId);
  if (!widget) return;

  const newPinned = !widget.pinned;
  const updatedWidgets = workspace.widgets.map((w) =>
    w.id === widgetId ? { ...w, pinned: newPinned } : w,
  );
  const wsIdx = state.workspaces.findIndex(
    (ws) => ws.id === workspace.id,
  );
  if (wsIdx === -1) return;
  state.workspaces[wsIdx] = {
    ...state.workspaces[wsIdx],
    widgets: updatedWidgets,
  };
  saveWorkspaces(state.workspaces);
  renderSingleWidget(widgetId);
}

export function setupWidgetColumnSortable() {
  if (typeof Sortable === 'undefined') return;

  const grid = document.getElementById('widget-grid');
  if (!grid) return;

  Object.keys(widgetSortableInstances).forEach((key) => {
    widgetSortableInstances[key].destroy();
    delete widgetSortableInstances[key];
  });

  grid.querySelectorAll('.widget-column').forEach((col) => {
    const colIdx = parseInt(col.dataset.column, 10);
    if (Number.isNaN(colIdx)) return;

    widgetSortableInstances[colIdx] = Sortable.create(col, {
      group: 'widget-columns',
      draggable: '.widget:not(.widget-pinned)',
      handle: '.widget-drag-handle',
      filter: '.edit-title-btn, .remove-widget-btn, .pin-widget-btn',
      preventOnFilter: true,
      animation: 150,
      ghostClass: 'widget-ghost',
      chosenClass: 'widget-chosen',
      dragClass: 'widget-drag',
      fallbackOnBody: true,
      emptyInsertThreshold: 16,
      onStart: () => setBookmarkSortablesDisabled(true),
      onEnd: () => {
        setBookmarkSortablesDisabled(false);
        persistWidgetLayoutFromGrid(grid);
      },
    });
  });
}

export function setupAddWidgetListeners(container) {
  const emptyHint = container.querySelector('#add-widget-empty-hint');
  const menu = container.querySelector('#add-widget-menu');
  const closeBtn = container.querySelector('#close-menu');
  const addBtn = document.getElementById('add-widget');

  const showMenu = () => (menu.style.display = 'flex');
  const hideMenu = () => (menu.style.display = 'none');

  emptyHint?.addEventListener('click', showMenu);
  addBtn?.addEventListener('click', showMenu);
  closeBtn?.addEventListener('click', hideMenu);

  menu?.addEventListener('click', (e) => {
    if (e.target === menu) hideMenu();
  });

  menu?.querySelectorAll('.widget-options button').forEach((btn) => {
    btn.addEventListener('click', () => {
      addWidget(btn.dataset.type);
      hideMenu();
    });
  });
}

// Document-level event delegation for widget actions
document.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.remove-widget-btn');
  if (removeBtn) {
    const widgetEl = removeBtn.closest('.widget');
    if (!widgetEl) return;

    const widgetId = widgetEl.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace?.widgets.find((w) => w.id === widgetId);
    const widgetTitle = widget?.config?.title || t('modal.caldav.empty');

    (async () => {
      const ok = await showConfirm({
        title: t('widget.delete_confirm_title'),
        message: t('widget.delete_confirm_message', { name: widgetTitle }),
        confirmText: t('widget.remove'),
        danger: true,
      });
      if (ok) removeWidget(widgetId);
    })();
    return;
  }

  const pinBtn = e.target.closest('.pin-widget-btn');
  if (pinBtn) {
    e.stopPropagation();
    const widgetEl = pinBtn.closest('.widget');
    if (!widgetEl) return;
    const widgetId = widgetEl.dataset.widgetId;
    toggleWidgetPin(widgetId);
    return;
  }

  const editBtn = e.target.closest('.edit-title-btn');
  if (editBtn) {
    e.stopPropagation();
    const widgetEl = editBtn.closest('.widget');
    if (!widgetEl) return;
    const widgetId = widgetEl.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace?.widgets.find((w) => w.id === widgetId);
    if (widget) showWidgetSettingsModal(widget);
    return;
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.show-all-btn');
  if (!btn) return;

  const bookmarkExpanded = window._bookmarkExpanded || {};
  const widgetId = btn.dataset.bookmarkWidgetId;
  bookmarkExpanded[widgetId] = !bookmarkExpanded[widgetId];
  renderSingleWidget(widgetId);
});
