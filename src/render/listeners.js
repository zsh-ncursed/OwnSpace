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
import { updateWidgetConfig, removeWidget } from '../widgets/management.js';
import { renderWidgetGrid, renderWidget } from './grid.js';
import { showConfirm, showRecurringDeleteChoice, showNotification } from '../ui/modals.js';
import { addWidget } from '../widgets/management.js';
import { fetchWeather } from '../widgets/weather.js';
import { browserMessaging } from '../export-import.js';
import { state } from '../state.js';
import { syncCalDAVEvents, showCalDAVCalendarPicker } from '../caldav/sync.js';
import { showEventModal, showWidgetSettingsModal } from '../widgets/event-modal.js';
import { setupCalculatorWidget } from '../widgets/calculator.js';
import { addTask, toggleTask, renameTask, deleteTask } from '../widgets/todo.js';
import { shiftMonth, deleteEvent } from '../widgets/calendar.js';
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
function renderSingleWidget(widgetId) {
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
  // re-bind listeners for just this card
  setupWidgetListeners(newEl);
  const calcEl = newEl.querySelector('.calculator-widget');
  if (calcEl) {
    const calcWidget = workspace.widgets.find((w) => w.id === widgetId);
    if (calcWidget) setupCalculatorWidget(calcEl, calcWidget);
  }
  ensureDatetimeTicker();
}

export function setupWidgetListeners(container) {
  container.querySelectorAll('.bookmarks-widget').forEach((el) => {
    const widgetId = el.dataset.widgetId;

    const list = el.querySelector('.bookmarks-list');
    if (list && typeof Sortable !== 'undefined') {
      if (sortableInstances[widgetId]) {
        sortableInstances[widgetId].destroy();
        delete sortableInstances[widgetId];
      }

      sortableInstances[widgetId] = Sortable.create(list, {
        draggable: '.bookmark-item',
        animation: 150,
        ghostClass: 'bookmark-ghost',
        chosenClass: 'bookmark-chosen',
        dragClass: 'bookmark-drag',
        fallbackOnBody: true,
        delay: 80,
        delayOnTouchOnly: true,
        filter: '.bookmark-title, .edit-btn, .delete-btn, .title-input',
        preventOnFilter: true,
        onStart: () => {
          list.classList.add('dragging');
          setColumnSortablesDisabled(true);
        },
        onEnd: () => {
          list.classList.remove('dragging');
          setColumnSortablesDisabled(false);
          persistBookmarkOrder(widgetId, list);
        },
      });
    }

    const addBtn = el.querySelector('.add-bookmark-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const input = el.querySelector('.new-url-input');
        const url = input.value.trim();
        if (!url) return;

        let fullUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          fullUrl = 'https://' + url;
        }

        try {
          new URL(fullUrl);
        } catch {
          showNotification(t('widget.bookmarks.invalid_url'));
          return;
        }

        const hostname = new URL(fullUrl).hostname;
        const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

        const workspace = getActiveWorkspace();
        const widget = workspace.widgets.find((w) => w.id === widgetId);
        const bookmarks = widget.config.bookmarks || [];

        let title = fullUrl;
        let titleSource = 'hostname';

        try {
          const response = await browserMessaging.sendMessage({
            type: 'fetchTitle',
            payload: { url: fullUrl },
          });
          if (response.success && response.result?.title) {
            title = response.result.title;
            titleSource = 'fetched';
          }
        } catch {
          /* browserMessaging not available */
        }

        if (titleSource !== 'fetched') {
          try {
            const resp = await fetch(fullUrl, { mode: 'cors' });
            if (resp.ok) {
              const html = await resp.text();
              const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
              if (match) {
                title = match[1].trim();
                titleSource = 'fetched';
              }
            }
          } catch {
            /* fetch failed */
          }
        }

        const newBookmark = {
          id: crypto.randomUUID(),
          url: fullUrl,
          title,
          favicon,
        };

        updateWidgetConfig(widgetId, {
          bookmarks: [...bookmarks, newBookmark],
        });
      });
    }

    el.querySelectorAll('.bookmark-item').forEach((item) => {
      const bmId = item.dataset.bookmarkId;

      const saveBookmark = () => {
        const newTitle =
          item.querySelector('.title-input').value.trim() ||
          item.querySelector('.title-input').value;
        const newUrl =
          item.querySelector('.url-input').value.trim() ||
          item.querySelector('.url-input').value;
        const workspace = getActiveWorkspace();
        const widget = workspace.widgets.find((w) => w.id === widgetId);
        const updated = widget.config.bookmarks.map((b) =>
          b.id === bmId ? { ...b, title: newTitle, url: newUrl } : b,
        );
        updateWidgetConfig(widgetId, { bookmarks: updated });
      };

      const cancelEdit = () => {
        const titleInput = item.querySelector('.title-input');
        const urlInput = item.querySelector('.url-input');
        const link = item.querySelector('.bookmark-title');
        const workspace = getActiveWorkspace();
        const widget = workspace.widgets.find((w) => w.id === widgetId);
        const bm = widget.config.bookmarks.find((b) => b.id === bmId);
        titleInput.value = bm.title;
        urlInput.value = bm.url;
        item.querySelector('.bookmark-edit').style.display = 'none';
        link.style.display = '';
      };

      const editBtn = item.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          const editForm = item.querySelector('.bookmark-edit');
          const link = item.querySelector('.bookmark-title');

          if (editForm.style.display === 'none') {
            editForm.style.display = 'flex';
            link.style.display = 'none';
            editForm.querySelector('.title-input').focus();
            editForm.querySelector('.title-input').select();
          } else {
            saveBookmark();
          }
        });
      }

      const bookmarkEdit = item.querySelector('.bookmark-edit');
      if (bookmarkEdit) {
        bookmarkEdit.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveBookmark();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
          }
        });
      }

      const deleteBtn = item.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          const workspace = getActiveWorkspace();
          const widget = workspace.widgets.find((w) => w.id === widgetId);
          const bookmarks = widget.config.bookmarks.filter(
            (b) => b.id !== bmId,
          );
          updateWidgetConfig(widgetId, { bookmarks });
        });
      }
    });
  });

  container.querySelectorAll('.notes-widget textarea').forEach((textarea) => {
    const widgetEl = textarea.closest('.notes-widget');
    const widgetId = widgetEl.dataset.widgetId;
    let saveTimeout;

    textarea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        updateWidgetConfig(widgetId, { content: textarea.value }, true);
      }, 500);
    });
  });

  container.querySelectorAll('.datetime-widget').forEach((el) => {
    updateDateTime(el);
  });

  container.querySelectorAll('.todo-widget').forEach((el) => {
    const widgetId = el.dataset.widgetId;

    function getTodoWidget() {
      const ws = getActiveWorkspace();
      return ws?.widgets.find((w) => w.id === widgetId);
    }

    const todoAddBtn = el.querySelector('.todo-add-btn');
    if (todoAddBtn) {
      todoAddBtn.addEventListener('click', () => {
        const input = el.querySelector('.todo-new-input');
        const w = getTodoWidget();
        if (!w) return;
        const tasks = addTask(w.config.tasks || [], input.value);
        if (tasks === w.config.tasks) return;
        updateWidgetConfig(widgetId, { tasks }, true);
        input.value = '';
        renderSingleWidget(widgetId);
      });
    }
    const todoNewInput = el.querySelector('.todo-new-input');
    if (todoNewInput) {
      todoNewInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          todoAddBtn?.click();
        }
      });
    }

    el.querySelectorAll('.todo-item').forEach((item) => {
      const taskId = item.dataset.taskId;

      item
        .querySelector('.todo-checkbox')
        .addEventListener('change', () => {
          const w = getTodoWidget();
          if (!w) return;
          const tasks = toggleTask(w.config.tasks || [], taskId);
          updateWidgetConfig(widgetId, { tasks }, true);
          renderSingleWidget(widgetId);
        });

      item.querySelector('.todo-text').addEventListener('change', () => {
        const text = item.querySelector('.todo-text').value;
        const w = getTodoWidget();
        if (!w) return;
        const tasks = renameTask(w.config.tasks || [], taskId, text);
        updateWidgetConfig(widgetId, { tasks }, true);
      });

      item.querySelector('.todo-delete').addEventListener('click', () => {
        const w = getTodoWidget();
        if (!w) return;
        const tasks = deleteTask(w.config.tasks || [], taskId);
        updateWidgetConfig(widgetId, { tasks }, true);
        renderSingleWidget(widgetId);
      });
    });
  });

  container.querySelectorAll('.weather-widget').forEach((el) => {
    const widgetId = el.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace.widgets.find((w) => w.id === widgetId);

    if (widget && widget.config.apiKey) {
      fetchWeather(el, widget.config.apiKey, widget.config.city || 'Moscow');
    }

    el.querySelector('.change-key-btn')?.addEventListener('click', () => {
      updateWidgetConfig(widgetId, { apiKey: '' });
    });

    const editCityBtn = el.querySelector('.edit-city-btn');
    const cityEditInput = el.querySelector('.city-edit-input');
    if (editCityBtn && cityEditInput) {
      const saveCity = () => {
        const newCity = cityEditInput.value.trim() || 'Moscow';
        if (newCity === (widget?.config.city || 'Moscow')) {
          cityEditInput.style.display = 'none';
          return;
        }
        updateWidgetConfig(widgetId, { city: newCity });
        cityEditInput.style.display = 'none';
      };
      editCityBtn.addEventListener('click', () => {
        cityEditInput.value = widget?.config.city || 'Moscow';
        cityEditInput.style.display = '';
        cityEditInput.focus();
        cityEditInput.select();
      });
      cityEditInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveCity();
        } else if (e.key === 'Escape') {
          cityEditInput.style.display = 'none';
        }
      });
      cityEditInput.addEventListener('blur', saveCity);
    }

    const input = el.querySelector('.api-key-input');
    const cityInput = el.querySelector('.city-input');
    const saveBtn = el.querySelector('.api-key-save-btn');
    const status = el.querySelector('.api-key-save-status');
    if (input && widgetId) {
      const parseKey = (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return '';
        const m = trimmed.match(/^[A-Za-z_][A-Za-z0-9_-]*=(.+)$/);
        return m ? m[1].trim() : trimmed;
      };
      const saveKey = () => {
        const key = parseKey(input.value);
        if (!key) {
          if (status) {
            status.textContent = t('widget.weather.enter_key_short');
            status.dataset.state = 'error';
          }
          return;
        }
        const city = cityInput
          ? cityInput.value.trim() || 'Moscow'
          : widget?.config.city || 'Moscow';
        updateWidgetConfig(widgetId, { apiKey: key, city });
        if (input.value.trim() !== key) input.value = key;
        if (status) {
          status.textContent = '✓ ' + t('common.save');
          status.dataset.state = 'ok';
          clearTimeout(saveKey._t);
          saveKey._t = setTimeout(() => {
            status.textContent = '';
            delete status.dataset.state;
          }, 1800);
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveKey();
        }
      });
      input.addEventListener('blur', saveKey);
      saveBtn?.addEventListener('click', saveKey);
    }
  });

  container.querySelectorAll('.calendar-widget').forEach((el) => {
    const widgetId = el.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace.widgets.find((w) => w.id === widgetId);
    const now = new Date();
    const viewYear = widget.config.viewYear ?? now.getFullYear();
    const viewMonth = widget.config.viewMonth ?? now.getMonth();

    el.querySelector('.prev-month')?.addEventListener('click', () => {
      const nv = shiftMonth(viewYear, viewMonth, -1);
      updateWidgetConfig(widgetId, nv, true);
      renderSingleWidget(widgetId);
    });

    el.querySelector('.next-month')?.addEventListener('click', () => {
      const nv = shiftMonth(viewYear, viewMonth, 1);
      updateWidgetConfig(widgetId, nv, true);
      renderSingleWidget(widgetId);
    });

    el.querySelectorAll('.calendar-day:not(.empty)').forEach((dayEl) => {
      dayEl.addEventListener('click', (e) => {
        const bar = e.target.closest('.event-bar');
        if (bar) {
          e.stopPropagation();
          const eventId = bar.dataset.eventId;
          const event = (widget.config.events || []).find(
            (ev) => ev.id === eventId,
          );
          if (event) showEventModal(widget, event);
          return;
        }
        const day = parseInt(dayEl.dataset.day, 10);
        updateWidgetConfig(widgetId, { selectedDay: day }, true);
        renderSingleWidget(widgetId);
      });
    });

    el.querySelector('.add-event-btn')?.addEventListener('click', () => {
      showEventModal(widget, null);
    });

    el.querySelectorAll('.event-item').forEach((item) => {
      const eventId = item.dataset.eventId;
      const event = (widget.config.events || []).find(
        (ev) => ev.id === eventId,
      );
      item.addEventListener('click', (e) => {
        if (e.target.closest('.event-delete-btn')) return;
        showEventModal(widget, event);
      });

      item
        .querySelector('.event-delete-btn')
        ?.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (event?.source === 'caldav') return;
          const isRecurring =
            !!(
              event?.recurring?.type && event.recurring.type !== 'none'
            ) || !!event?.isRecurringInstance;
          if (isRecurring) {
            const choice = await showRecurringDeleteChoice();
            if (!choice) return;
            const updated = deleteEvent(widget.config.events || [], eventId, true, choice);
            updateWidgetConfig(widgetId, { events: updated }, true);
          } else {
            const updated = deleteEvent(widget.config.events || [], eventId, false);
            updateWidgetConfig(widgetId, { events: updated }, true);
          }
          renderSingleWidget(widgetId);
        });
    });

    el.querySelector('.caldav-sync-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const btn = e.currentTarget;
      btn.classList.add('caldav-syncing');
      const ok = await syncCalDAVEvents(widgetId);
      btn.classList.remove('caldav-syncing');
      if (!ok && !widget.config.caldavCalendarHref) {
        showCalDAVCalendarPicker(widgetId);
      }
      if (ok) renderSingleWidget(widgetId);
    });
  });

  container.querySelectorAll('.calculator-widget').forEach((el) => {
    const widgetId = el.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace?.widgets.find((w) => w.id === widgetId);
    if (widget) setupCalculatorWidget(el, widget);
  });

  ensureDatetimeTicker();
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
