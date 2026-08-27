import { eventDateKey } from '../utils/date.js';
import { escapeHtml } from '../ui/escape.js';
import { showConfirm } from '../ui/modals.js';
import { state, getActiveWorkspace } from '../state.js';
import { updateWidgetConfig } from './management.js';
import { upsertEventWithRecurring } from './calendar.js';
import { renderWidgetGrid } from '../render/grid.js';
import { deleteWorkspace } from '../workspaces.js';
import { findWeatherConfig } from './calendar-weather.js';
import { t } from '../i18n/index.js';

export function showWidgetSettingsModal(widget) {
  const config = widget.config || {};
  const isCalendar = widget.type === 'calendar';
  const ws = getActiveWorkspace();
  const weatherCfg = isCalendar ? findWeatherConfig(ws) : null;

  const weatherSection = isCalendar && weatherCfg
    ? `<label class="event-field event-checkbox-field">
        <label class="event-checkbox-label">
          <input type="checkbox" id="widget-show-weather" ${config.showWeather ? 'checked' : ''} />
          <span>${t('widget.calendar.show_weather')}</span>
        </label>
      </label>`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">${t('modal.widget.settings')}</h3>
      <form class="widget-settings-form">
        <label class="event-field">
          <span>${t('modal.widget.name')}</span>
          <input type="text" id="widget-title" value="${escapeHtml(config.title || '')}" />
        </label>
        <label class="event-field">
          <span>${t('modal.widget.bg_color')}</span>
          <input type="color" id="widget-bgcolor" value="${config.bgColor || '#000000'}" />
        </label>
        <label class="event-field">
          <span>${t('modal.widget.opacity')}</span>
          <input type="range" id="widget-opacity" min="0" max="100" value="${config.opacity != null ? config.opacity : 100}" />
        </label>
        ${weatherSection}
      </form>
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button id="save-widget-settings" class="btn btn-primary" style="flex: 1;">${t('common.save')}</button>
        <button id="cancel-widget-settings" class="btn btn-secondary" style="flex: 1;">${t('common.cancel')}</button>
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
      const updates = {
        title: title || config.title,
        bgColor,
        opacity,
      };
      const weatherCb = overlay.querySelector('#widget-show-weather');
      if (weatherCb) {
        updates.showWeather = weatherCb.checked;
      }
      updateWidgetConfig(widget.id, updates);
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
      <h3>${isEdit ? t('modal.event.edit') : t('modal.event.new')}</h3>
      <form class="event-form">
        <div class="event-field">
          <label>${t('modal.event.title')}</label>
          <input type="text" id="event-title" value="${escapeHtml(event.title)}" />
        </div>
        <div class="event-field event-checkbox-field">
          <label class="event-checkbox-label">
            <input type="checkbox" id="event-allday" ${isAllDay ? 'checked' : ''} />
            <span>${t('modal.event.all_day')}</span>
          </label>
        </div>
        <div class="event-field">
          <label>${t('modal.event.start')}</label>
          <div class="event-datetime-row">
            <input type="date" id="event-date" value="${event.date}" />
            <input type="time" id="event-time" value="${event.time || ''}" class="event-time-input" ${isAllDay ? 'style="display:none"' : ''} />
          </div>
        </div>
        <div class="event-field event-end-field" ${isAllDay ? 'style="display:none"' : ''}>
          <label>${t('modal.event.end')}</label>
          <div class="event-datetime-row">
            <input type="date" id="event-enddate" value="${event.endDate || event.date}" />
            <input type="time" id="event-endtime" value="${event.endTime || ''}" class="event-time-input" />
          </div>
        </div>
        <div class="event-field">
          <label>${t('modal.event.color')}</label>
          <input type="color" id="event-color" value="${event.color || '#5b6cff'}" />
        </div>
        <div class="event-field">
          <label>${t('modal.event.recurring')}</label>
          <select id="event-recurring-toggle">
            <option value="none" ${!event.recurring || event.recurring?.type === 'none' ? 'selected' : ''}>${t('modal.event.recurring.none')}</option>
            <option value="interval" ${event.recurring && event.recurring?.type !== 'none' ? 'selected' : ''}>${t('modal.event.recurring.interval')}</option>
          </select>
        </div>
        <div class="event-recurring-config" id="recurring-config" style="display:${event.recurring && event.recurring?.type !== 'none' ? 'block' : 'none'};">
          <div class="event-field event-recurring-interval-row">
            <label>${t('modal.event.recurring.period')}</label>
            <div class="event-recurring-interval-controls">
              <input type="number" id="event-recurring-interval" min="1" value="${event.recurring?.interval || 1}" />
              <select id="event-recurring-unit">
                <option value="seconds" ${event.recurring?.type === 'seconds' ? 'selected' : ''}>${t('modal.event.recurring.seconds')}</option>
                <option value="minutes" ${event.recurring?.type === 'minutes' ? 'selected' : ''}>${t('modal.event.recurring.minutes')}</option>
                <option value="hours" ${event.recurring?.type === 'hours' ? 'selected' : ''}>${t('modal.event.recurring.hours')}</option>
                <option value="daily" ${event.recurring?.type === 'daily' ? 'selected' : ''}>${t('modal.event.recurring.days')}</option>
                <option value="weekly" ${event.recurring?.type === 'weekly' ? 'selected' : ''}>${t('modal.event.recurring.weeks')}</option>
                <option value="monthly" ${event.recurring?.type === 'monthly' ? 'selected' : ''}>${t('modal.event.recurring.months')}</option>
                <option value="yearly" ${event.recurring?.type === 'yearly' ? 'selected' : ''}>${t('modal.event.recurring.years')}</option>
              </select>
            </div>
          </div>
          <div class="event-field">
            <label>${t('modal.event.recurring.end')}</label>
            <div class="event-recurring-end-row">
              <input type="date" id="event-recurring-enddate" value="${event.recurring?.endDate || ''}" />
              <input type="time" id="event-recurring-endtime" value="${event.recurring?.endTime || ''}" />
            </div>
          </div>
        </div>
        <div class="event-money">
          <label>${t('modal.event.money')}</label>
          <div class="event-money-row">
            <select id="event-moneytype" class="event-money-type">
              <option value="expense" ${event.moneyType === 'expense' ? 'selected' : ''}>${t('modal.event.money.expense')}</option>
              <option value="income" ${event.moneyType === 'income' ? 'selected' : ''}>${t('modal.event.money.income')}</option>
            </select>
            <input type="number" id="event-money" class="event-money-amount" min="0" step="0.01" placeholder="0" value="${(typeof event.money === 'number' && isFinite(event.money)) ? event.money : ''}" />
          </div>
        </div>
      </form>
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button id="save-event" class="btn btn-primary" style="flex: 1;">${isEdit ? t('modal.event.save') : t('modal.event.add')}</button>
        <button id="cancel-event" class="btn btn-secondary" style="flex: 1;">${t('common.cancel')}</button>
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

    const events = upsertEventWithRecurring(
      widget.config.events || [],
      newEvent,
    );

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
    title: t('modal.workspace.delete_title'),
    message: t('modal.workspace.delete_message', { name: ws.name }),
    confirmText: t('common.delete'),
    danger: true,
  });
  if (ok) deleteWorkspace(wsId);
});
