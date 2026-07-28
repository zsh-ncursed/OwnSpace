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
import { renderWidgetGrid } from './grid.js';
import { showConfirm, showRecurringDeleteChoice, showNotification } from '../ui/modals.js';
import { addWidget } from '../widgets/management.js';
import { fetchWeather } from '../widgets/weather.js';
import { browserMessaging } from '../export-import.js';
import { state } from '../state.js';
import { syncCalDAVEvents, showCalDAVCalendarPicker } from '../caldav/sync.js';
import { showEventModal, showWidgetSettingsModal } from '../widgets/event-modal.js';

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

    el.querySelector('.add-bookmark-btn').addEventListener('click', async () => {
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
        showNotification('Неверный URL');
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

      item.querySelector('.edit-btn').addEventListener('click', () => {
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

      item
        .querySelector('.bookmark-edit')
        .addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveBookmark();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
          }
        });

      item.querySelector('.delete-btn').addEventListener('click', () => {
        const workspace = getActiveWorkspace();
        const widget = workspace.widgets.find((w) => w.id === widgetId);
        const bookmarks = widget.config.bookmarks.filter(
          (b) => b.id !== bmId,
        );
        updateWidgetConfig(widgetId, { bookmarks });
      });
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
    setInterval(() => updateDateTime(el), 30000);
  });

  container.querySelectorAll('.todo-widget').forEach((el) => {
    const widgetId = el.dataset.widgetId;

    function getTodoWidget() {
      const ws = getActiveWorkspace();
      return ws?.widgets.find((w) => w.id === widgetId);
    }

    el.querySelector('.todo-add-btn').addEventListener('click', () => {
      const input = el.querySelector('.todo-new-input');
      const text = input.value.trim();
      if (!text) return;
      const w = getTodoWidget();
      if (!w) return;
      const tasks = [
        ...(w.config.tasks || []),
        { id: crypto.randomUUID(), text, done: false },
      ];
      updateWidgetConfig(widgetId, { tasks });
      input.value = '';
      renderWidgetGrid();
    });
    el.querySelector('.todo-new-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.querySelector('.todo-add-btn').click();
      }
    });

    el.querySelectorAll('.todo-item').forEach((item) => {
      const taskId = item.dataset.taskId;

      item
        .querySelector('.todo-checkbox')
        .addEventListener('change', () => {
          const w = getTodoWidget();
          if (!w) return;
          const tasks = (w.config.tasks || []).map((t) =>
            t.id === taskId ? { ...t, done: !t.done } : t,
          );
          updateWidgetConfig(widgetId, { tasks });
          renderWidgetGrid();
        });

      item.querySelector('.todo-text').addEventListener('change', () => {
        const text = item.querySelector('.todo-text').value.trim();
        if (!text) return;
        const w = getTodoWidget();
        if (!w) return;
        const tasks = (w.config.tasks || []).map((t) =>
          t.id === taskId ? { ...t, text } : t,
        );
        updateWidgetConfig(widgetId, { tasks });
      });

      item.querySelector('.todo-delete').addEventListener('click', () => {
        const w = getTodoWidget();
        if (!w) return;
        const tasks = (w.config.tasks || []).filter(
          (t) => t.id !== taskId,
        );
        updateWidgetConfig(widgetId, { tasks });
        renderWidgetGrid();
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
            status.textContent = 'Введите ключ';
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
          status.textContent = '✓ Сохранено';
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
      let m = viewMonth - 1;
      let y = viewYear;
      if (m < 0) {
        m = 11;
        y--;
      }
      updateWidgetConfig(widgetId, {
        viewYear: y,
        viewMonth: m,
        selectedDay: null,
      });
      renderWidgetGrid();
    });

    el.querySelector('.next-month')?.addEventListener('click', () => {
      let m = viewMonth + 1;
      let y = viewYear;
      if (m > 11) {
        m = 0;
        y++;
      }
      updateWidgetConfig(widgetId, {
        viewYear: y,
        viewMonth: m,
        selectedDay: null,
      });
      renderWidgetGrid();
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
        updateWidgetConfig(widgetId, { selectedDay: day });
        renderWidgetGrid();
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
            if (choice === 'all') {
              const parentId = event.recurringParentId || event.id;
              const updated = (widget.config.events || []).filter(
                (ev) =>
                  !(
                    ev.recurringParentId === parentId ||
                    ev.id === parentId
                  ),
              );
              updateWidgetConfig(widgetId, { events: updated });
            } else {
              const updated = (widget.config.events || []).filter(
                (ev) => ev.id !== eventId,
              );
              updateWidgetConfig(widgetId, { events: updated });
            }
          } else {
            const updated = (widget.config.events || []).filter(
              (ev) => ev.id !== eventId,
            );
            updateWidgetConfig(widgetId, { events: updated });
          }
          renderWidgetGrid();
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
      if (ok) renderWidgetGrid();
    });
  });
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
  renderWidgetGrid();
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
    const widgetTitle = widget?.config?.title || 'этот виджет';

    (async () => {
      const ok = await showConfirm({
        title: 'Удалить виджет?',
        message: `Виджет "${widgetTitle}" будет удалён. Это действие нельзя отменить.`,
        confirmText: 'Удалить',
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
  renderWidgetGrid();
});
