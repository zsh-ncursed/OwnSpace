import { localDateStr } from '../utils/date.js';
import { escapeHtml } from '../ui/escape.js';
import { showConfirm } from '../ui/modals.js';
import { state } from '../state.js';
import { updateWidgetConfig } from './management.js';
import { generateRecurringEvents } from './calendar.js';
import { renderWidgetGrid } from '../render/grid.js';
import { deleteWorkspace } from '../workspaces.js';

export function showWidgetSettingsModal(widget) {
  const config = widget.config || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">Настройки виджета</h3>
      <form class="widget-settings-form">
        <label class="event-field">
          <span>Название:</span>
          <input type="text" id="widget-title" value="${escapeHtml(config.title || '')}" />
        </label>
        <label class="event-field">
          <span>Цвет фона:</span>
          <input type="color" id="widget-bgcolor" value="${config.bgColor || '#000000'}" />
        </label>
        <label class="event-field">
          <span>Прозрачность:</span>
          <input type="range" id="widget-opacity" min="0" max="100" value="${config.opacity != null ? config.opacity : 100}" />
        </label>
      </form>
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button id="save-widget-settings" class="btn btn-primary" style="flex: 1;">Сохранить</button>
        <button id="cancel-widget-settings" class="btn btn-secondary" style="flex: 1;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay
    .querySelector('#save-widget-settings')
    .addEventListener('click', () => {
      const title = overlay.querySelector('#widget-title').value.trim();
      const bgColor = overlay.querySelector('#widget-bgcolor').value;
      const opacity = parseInt(
        overlay.querySelector('#widget-opacity').value,
        10,
      );
      updateWidgetConfig(widget.id, {
        title: title || config.title,
        bgColor,
        opacity,
      });
      overlay.remove();
      renderWidgetGrid();
    });
  overlay
    .querySelector('#cancel-widget-settings')
    .addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

export function showEventModal(widget, existingEvent) {
  const isEdit = !!existingEvent;
  const event = existingEvent || {
    id: crypto.randomUUID(),
    title: '',
    date: localDateStr(new Date()),
    time: '',
    endDate: '',
    endTime: '',
    color: '',
    recurring: { type: 'none', interval: 1, endDate: '' },
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${isEdit ? 'Редактировать событие' : 'Новое событие'}</h3>
      <form class="event-form">
        <div class="event-field">
          <label>Название:</label>
          <input type="text" id="event-title" value="${escapeHtml(event.title)}" />
        </div>
        <div class="event-field">
          <label>Дата:</label>
          <input type="date" id="event-date" value="${event.date}" />
        </div>
        <div class="event-field">
          <label>Время начала:</label>
          <input type="time" id="event-time" value="${event.time || ''}" />
        </div>
        <div class="event-field">
          <label>Время окончания:</label>
          <input type="time" id="event-endtime" value="${event.endTime || ''}" />
        </div>
        <div class="event-field">
          <label>Цвет:</label>
          <input type="color" id="event-color" value="${event.color || '#5b6cff'}" />
        </div>
        <div class="event-field">
          <label>Повтор:</label>
          <select id="event-recurring-type">
            <option value="none" ${event.recurring?.type === 'none' ? 'selected' : ''}>Не повторять</option>
            <option value="daily" ${event.recurring?.type === 'daily' ? 'selected' : ''}>Ежедневно</option>
            <option value="weekly" ${event.recurring?.type === 'weekly' ? 'selected' : ''}>Еженедельно</option>
            <option value="monthly" ${event.recurring?.type === 'monthly' ? 'selected' : ''}>Ежемесячно</option>
            <option value="yearly" ${event.recurring?.type === 'yearly' ? 'selected' : ''}>Ежегодно</option>
          </select>
        </div>
        <div class="event-field">
          <label>Интервал (каждые N):</label>
          <input type="number" id="event-recurring-interval" min="1" value="${event.recurring?.interval || 1}" />
        </div>
        <div class="event-field">
          <label>Дата окончания повторов:</label>
          <input type="date" id="event-recurring-enddate" value="${event.recurring?.endDate || ''}" />
        </div>
      </form>
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button id="save-event" class="btn btn-primary" style="flex: 1;">${isEdit ? 'Сохранить' : 'Добавить'}</button>
        <button id="cancel-event" class="btn btn-secondary" style="flex: 1;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#save-event').addEventListener('click', () => {
    const title = overlay.querySelector('#event-title').value.trim();
    const date = overlay.querySelector('#event-date').value;
    const time = overlay.querySelector('#event-time').value || null;
    const endTime = overlay.querySelector('#event-endtime').value || null;
    const color = overlay.querySelector('#event-color').value || null;
    const recurringType = overlay.querySelector('#event-recurring-type').value;
    const recurringInterval =
      parseInt(
        overlay.querySelector('#event-recurring-interval').value,
        10,
      ) || 1;
    const recurringEndDate = overlay.querySelector(
      '#event-recurring-enddate',
    ).value;

    if (!title || !date) return;

    const newEvent = {
      id: event.id,
      title,
      date,
      time,
      endTime: endTime || undefined,
      color: color || undefined,
      recurring:
        recurringType !== 'none'
          ? {
              type: recurringType,
              interval: recurringInterval,
              endDate: recurringEndDate || undefined,
            }
          : undefined,
    };

    let events = widget.config.events || [];
    const idx = events.findIndex((e) => e.id === event.id);
    if (idx !== -1) {
      events[idx] = newEvent;
    } else {
      events.push(newEvent);
    }

    if (newEvent.recurring && newEvent.recurring.type !== 'none') {
      const recurringInstances = generateRecurringEvents(
        newEvent,
        newEvent.recurring,
      );
      events.push(...recurringInstances);
    }

    updateWidgetConfig(widget.id, { events });
    overlay.remove();
    renderWidgetGrid();
  });

  overlay
    .querySelector('#cancel-event')
    .addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

document.addEventListener('click', async (e) => {
  const deleteBtn = e.target.closest('.workspace-tab-delete');
  if (!deleteBtn) return;
  e.stopPropagation();
  const tab = deleteBtn.closest('.workspace-tab');
  if (!tab) return;
  const wsId = tab.dataset.workspaceId;
  const ws = state.workspaces.find((w) => w.id === wsId);
  if (!ws) return;
  const ok = await showConfirm({
    title: 'Удалить пространство?',
    message: `Пространство «${ws.name}» будет безвозвратно удалено.`,
    confirmText: 'Удалить',
    danger: true,
  });
  if (ok) deleteWorkspace(wsId);
});
