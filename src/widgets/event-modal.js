import { localDateStr, eventDateKey } from '../utils/date.js';
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
  const now = new Date();
  const viewYear = widget.config.viewYear ?? now.getFullYear();
  const viewMonth = widget.config.viewMonth ?? now.getMonth();
  const selectedDay = widget.config.selectedDay ?? now.getDate();
  const initialDate = existingEvent?.date
    || eventDateKey(viewYear, viewMonth, selectedDay);
  const event = existingEvent || {
    id: crypto.randomUUID(),
    title: '',
    date: initialDate,
    endDate: '',
    time: '',
    endTime: '',
    color: '',
    recurring: { type: 'none', interval: 1, endDate: '' },
    moneyType: 'expense',
    money: null,
  };
  const isAllDay = !event.time;

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
        <div class="event-field event-checkbox-field">
          <label class="event-checkbox-label">
            <input type="checkbox" id="event-allday" ${isAllDay ? 'checked' : ''} />
            <span>Весь день</span>
          </label>
        </div>
        <div class="event-field">
          <label>Начало:</label>
          <div class="event-datetime-row">
            <input type="date" id="event-date" value="${event.date}" />
            <input type="time" id="event-time" value="${event.time || ''}" class="event-time-input" ${isAllDay ? 'style="display:none"' : ''} />
          </div>
        </div>
        <div class="event-field event-end-field" ${isAllDay ? 'style="display:none"' : ''}>
          <label>Окончание:</label>
          <div class="event-datetime-row">
            <input type="date" id="event-enddate" value="${event.endDate || event.date}" />
            <input type="time" id="event-endtime" value="${event.endTime || ''}" class="event-time-input" />
          </div>
        </div>
        <div class="event-field">
          <label>Цвет:</label>
          <input type="color" id="event-color" value="${event.color || '#5b6cff'}" />
        </div>
        <div class="event-field">
          <label>Повтор:</label>
          <select id="event-recurring-toggle">
            <option value="none" ${!event.recurring || event.recurring?.type === 'none' ? 'selected' : ''}>Не повторять</option>
            <option value="interval" ${event.recurring && event.recurring?.type !== 'none' ? 'selected' : ''}>Интервал (каждые N)</option>
          </select>
        </div>
        <div class="event-recurring-config" id="recurring-config" style="display:${event.recurring && event.recurring?.type !== 'none' ? 'block' : 'none'};">
          <div class="event-field event-recurring-interval-row">
            <label>Период:</label>
            <div class="event-recurring-interval-controls">
              <input type="number" id="event-recurring-interval" min="1" value="${event.recurring?.interval || 1}" />
              <select id="event-recurring-unit">
                <option value="seconds" ${event.recurring?.type === 'seconds' ? 'selected' : ''}>секунд</option>
                <option value="minutes" ${event.recurring?.type === 'minutes' ? 'selected' : ''}>минут</option>
                <option value="hours" ${event.recurring?.type === 'hours' ? 'selected' : ''}>часов</option>
                <option value="daily" ${event.recurring?.type === 'daily' ? 'selected' : ''}>дней</option>
                <option value="weekly" ${event.recurring?.type === 'weekly' ? 'selected' : ''}>недель</option>
                <option value="monthly" ${event.recurring?.type === 'monthly' ? 'selected' : ''}>месяцев</option>
                <option value="yearly" ${event.recurring?.type === 'yearly' ? 'selected' : ''}>лет</option>
              </select>
            </div>
          </div>
          <div class="event-field">
            <label>Окончание:</label>
            <div class="event-recurring-end-row">
              <input type="date" id="event-recurring-enddate" value="${event.recurring?.endDate || ''}" />
              <input type="time" id="event-recurring-endtime" value="${event.recurring?.endTime || ''}" />
            </div>
          </div>
        </div>
        <div class="event-money">
          <label>Деньги:</label>
          <div class="event-money-row">
            <select id="event-moneytype" class="event-money-type">
              <option value="expense" ${event.moneyType === 'expense' ? 'selected' : ''}>− Расход</option>
              <option value="income" ${event.moneyType === 'income' ? 'selected' : ''}>+ Доход</option>
            </select>
            <input type="number" id="event-money" class="event-money-amount" min="0" step="0.01" placeholder="0" value="${(typeof event.money === 'number' && isFinite(event.money)) ? event.money : ''}" />
          </div>
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
    const endDate = overlay.querySelector('#event-enddate').value;
    const allDay = overlay.querySelector('#event-allday').checked;
    const time = allDay ? null : (overlay.querySelector('#event-time').value || null);
    const endTime = allDay ? null : (overlay.querySelector('#event-endtime').value || null);
    const color = overlay.querySelector('#event-color').value || null;
    const recurringToggle = overlay.querySelector('#event-recurring-toggle').value;
    const recurringInterval =
      parseInt(
        overlay.querySelector('#event-recurring-interval').value,
        10,
      ) || 1;
    const recurringUnit = overlay.querySelector('#event-recurring-unit').value;
    const recurringEndDate = overlay.querySelector(
      '#event-recurring-enddate',
    ).value;
    const recurringEndTime = overlay.querySelector(
      '#event-recurring-endtime',
    ).value;

    if (!title || !date) return;

    const moneyRaw = overlay.querySelector('#event-money')?.value;
    let moneyAmount = null;
    if (moneyRaw !== undefined && moneyRaw !== '' && moneyRaw !== null) {
      const parsed = parseFloat(moneyRaw.replace(',', '.'));
      if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
        moneyAmount = Math.round(parsed * 100) / 100;
      }
    }
    const moneyTypeVal = overlay.querySelector('#event-moneytype')?.value || 'expense';
    const hasMoney = moneyAmount !== null && moneyAmount > 0;

    let recurring = undefined;
    if (recurringToggle === 'interval') {
      recurring = {
        type: recurringUnit,
        interval: recurringInterval,
      };
      if (recurringEndDate) {
        recurring.endDate = recurringEndDate;
        if (recurringEndTime) recurring.endTime = recurringEndTime;
      }
    }

    const newEvent = {
      id: event.id,
      title,
      date,
      endDate: allDay ? null : (endDate || null),
      time,
      endTime: endTime || undefined,
      color: color || undefined,
      recurring,
      moneyType: hasMoney ? moneyTypeVal : null,
      money: hasMoney ? moneyAmount : null,
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

  const recurringToggle = overlay.querySelector('#event-recurring-toggle');
  const recurringConfig = overlay.querySelector('#recurring-config');
  recurringToggle?.addEventListener('change', () => {
    recurringConfig.style.display =
      recurringToggle.value === 'interval' ? 'block' : 'none';
  });

  const allDayCheckbox = overlay.querySelector('#event-allday');
  const timeInputs = overlay.querySelectorAll('.event-time-input');
  const endField = overlay.querySelector('.event-end-field');
  allDayCheckbox?.addEventListener('change', () => {
    const checked = allDayCheckbox.checked;
    timeInputs.forEach((input) => {
      input.style.display = checked ? 'none' : '';
    });
    endField.style.display = checked ? 'none' : '';
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
