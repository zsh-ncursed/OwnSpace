import { escapeHtml } from '../ui/escape.js';
import { pad2, timeAgo } from '../utils/date.js';

function eventDateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function migrateEvent(e) {
  if (!e) return null;
  let result;
  if (typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
    result = { id: e.id, title: e.title, date: e.date, time: e.time || null };
  } else if (
    typeof e.year === 'number' &&
    typeof e.month === 'number' &&
    typeof e.day === 'number'
  ) {
    result = {
      id: e.id,
      title: e.title,
      date: eventDateKey(e.year, e.month, e.day),
      time: e.time || null,
    };
  } else {
    return null;
  }
  if (e.recurring) result.recurring = e.recurring;
  if (e.isRecurringInstance) result.isRecurringInstance = true;
  if (e.recurringParentId) result.recurringParentId = e.recurringParentId;
  if (e.source) result.source = e.source;
  if (e.endDate) result.endDate = e.endDate;
  if (e.endTime) result.endTime = e.endTime;
  if (e.color) result.color = e.color;
  return result;
}

export function eventColor(_id, index, customColor) {
  if (customColor) return customColor;
  const hue = ((index ?? 0) * 137.508) % 360;
  return `hsl(${hue} 70% 58%)`;
}

export function advanceDate(date, type, interval) {
  switch (type) {
    case 'daily':
      date.setDate(date.getDate() + interval);
      break;
    case 'weekly':
      date.setDate(date.getDate() + interval * 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + interval);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + interval);
      break;
  }
}

export function isCustomRecurring(r) {
  return r && r.type !== 'none' && (r.interval > 1 || !!r.endDate);
}

export function generateRecurringEvents(baseEvent, recurringConfig) {
  const instances = [];
  const startDate = new Date(
    baseEvent.date + 'T' + (baseEvent.time || '00:00'),
  );

  const endDate = recurringConfig.endDate
    ? new Date(recurringConfig.endDate + 'T23:59:59')
    : null;
  let current = new Date(startDate);

  const maxCount = 365;
  let count = 0;

  advanceDate(current, recurringConfig.type, recurringConfig.interval);

  while (count < maxCount) {
    if (endDate && current > endDate) break;

    const instance = {
      id: crypto.randomUUID(),
      title: baseEvent.title,
      date: `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`,
      time: baseEvent.time || null,
      isRecurringInstance: true,
      recurringParentId: baseEvent.id,
      color: baseEvent.color || null,
    };

    instances.push(instance);
    count++;

    advanceDate(current, recurringConfig.type, recurringConfig.interval);
  }

  return instances;
}

export function renderCalendarWidget(widget) {
  const now = new Date();
  const viewYear = widget.config.viewYear ?? now.getFullYear();
  const viewMonth = widget.config.viewMonth ?? now.getMonth();
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('ru', {
    month: 'long',
  });
  const firstDayRaw = new Date(viewYear, viewMonth, 1).getDay();
  const firstDay = firstDayRaw === 0 ? 6 : firstDayRaw - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isViewingCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const todayDay = isViewingCurrentMonth ? now.getDate() : null;
  const monthPrefix = `${viewYear}-${pad2(viewMonth + 1)}`;

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const events = (widget.config.events || [])
    .map(migrateEvent)
    .filter(Boolean);
  const selectedDay = widget.config.selectedDay ?? null;
  const selectedDateKey = selectedDay
    ? eventDateKey(viewYear, viewMonth, selectedDay)
    : null;
  const selectedDate = selectedDateKey
    ? events
        .filter((e) => e.date === selectedDateKey)
        .sort((a, b) =>
          (a.time || '99:99').localeCompare(b.time || '99:99'),
        )
    : [];

  const eventsByDay = new Map();
  const colorIndexByEventId = new Map();
  const monthEventsSorted = events
    .filter((e) => e.date.startsWith(monthPrefix))
    .slice()
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.time || '99:99').localeCompare(b.time || '99:99');
    });

  monthEventsSorted.forEach((e, idx) => {
    colorIndexByEventId.set(e.id, idx);
    const day = parseInt(e.date.slice(8), 10);
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day).push(e);
  });

  for (const e of monthEventsSorted) {
    if (e.isRecurringInstance && e.recurringParentId) {
      if (colorIndexByEventId.has(e.recurringParentId)) {
        colorIndexByEventId.set(
          e.id,
          colorIndexByEventId.get(e.recurringParentId),
        );
      } else {
        const hash = e.recurringParentId
          .split('')
          .reduce((a, c) => a + c.charCodeAt(0), 0);
        colorIndexByEventId.set(e.id, hash % 1000);
      }
    }
  }

  const MAX_BARS = 3;

  return `
    <div class="calendar-widget" data-widget-id="${widget.id}">
      <div class="calendar-nav">
        <button class="prev-month icon-btn" title="Предыдущий месяц">${ICONS.action('chevron-left')}</button>
        <span class="calendar-title">${monthName} ${viewYear}</span>
        <button class="next-month icon-btn" title="Следующий месяц">${ICONS.action('chevron-right')}</button>
      </div>
      <div class="calendar-grid">
        ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
          .map((d) => `<div class="calendar-header">${d}</div>`)
          .join('')}
        ${days
          .map((day) => {
            const classes = ['calendar-day'];
            if (!day) classes.push('empty');
            if (day === todayDay) classes.push('today');
            if (day === selectedDay) classes.push('selected');
            const dayEvents = day ? eventsByDay.get(day) || [] : [];
            if (dayEvents.length > 0) classes.push('has-events');

            const allDayEvents = dayEvents.filter((e) => !e.time);
            const timedEvents = dayEvents.filter((e) => e.time);
            let cellStyle = '';
            if (allDayEvents.length > 0) {
              classes.push('has-allday');
              const first = allDayEvents[0];
              const colorIdx = colorIndexByEventId.get(first.id) ?? 0;
              const hue = ((colorIdx ?? 0) * 137.508) % 360;
              cellStyle = `style="background:hsla(${hue},70%,58%,0.2)"`;
              if (first.color) {
                const r = parseInt(first.color.slice(1, 3), 16);
                const g = parseInt(first.color.slice(3, 5), 16);
                const b = parseInt(first.color.slice(5, 7), 16);
                cellStyle = `style="background:rgba(${r},${g},${b},0.2)"`;
              }
              if (allDayEvents.length === 1) {
                classes.push('allday-single');
              }
            }

            const visible = timedEvents.slice(0, MAX_BARS);
            const overflow = timedEvents.length - visible.length;
            const bars = visible
              .map((e) => {
                const colorIdx = colorIndexByEventId.get(e.id) ?? 0;
                const isRecurring = !!(
                  e.isRecurringInstance ||
                  (e.recurring &&
                    e.recurring.type &&
                    e.recurring.type !== 'none')
                );
                return `<div class="event-bar ${isRecurring ? 'event-bar-recurring' : ''}"
                            data-event-id="${e.id}"
                            style="background:${eventColor(e.id, colorIdx, e.color)}"
                            title="${escapeHtml(e.title)} · ${e.time}${isRecurring ? ' (повторяющееся)' : ''}"></div>`;
              })
              .join('');
            const overflowHtml =
              overflow > 0
                ? `<span class="event-overflow">+${overflow}</span>`
                : '';

            return `
              <div class="${classes.join(' ')}" data-day="${day || ''}" ${cellStyle}>
                <span class="calendar-day-num">${day || ''}</span>
                ${timedEvents.length > 0 ? `<div class="event-bars">${bars}${overflowHtml}</div>` : ''}
              </div>
            `;
          })
          .join('')}
      </div>
      <div class="caldav-sync-row">
        <button class="caldav-sync-btn icon-btn" title="Синхронизировать CalDAV" aria-label="Синхронизировать">${ICONS.action('rotate-cw')}</button>
        <span class="caldav-sync-status">${widget.config.caldavCalendarName ? (widget.config.caldavLastSync ? timeAgo(widget.config.caldavLastSync) : 'CalDAV: нажмите для синхронизации') : ''}</span>
      </div>
      ${
        selectedDay
          ? `
        <div class="selected-day-panel">
          <div class="selected-day-header">
            <span>${selectedDay} ${monthName}</span>
            <button class="add-event-btn icon-btn" title="Добавить событие">${ICONS.btn('plus')}</button>
          </div>
          ${
            selectedDate.length > 0
              ? `
            <ul class="selected-day-events">
              ${selectedDate
                .map(
                  (e) => `
                <li data-event-id="${e.id}" class="event-item ${e.source === 'caldav' ? 'event-item-caldav' : ''}" title="${e.source === 'caldav' ? 'CalDAV (только чтение)' : 'Кликните для редактирования'}">
                  ${e.time ? `<span class="event-time">${e.time}</span>` : '<span class="event-time event-time-allday">весь день</span>'}
                  ${e.source === 'caldav' ? '<span class="caldav-badge">CalDAV</span>' : ''}
                  ${(e.recurring && e.recurring.type && e.recurring.type !== 'none') || e.isRecurringInstance ? '<span class="event-recurring-badge" title="Повторяющееся событие">↻</span>' : ''}
                  <span class="event-title">${escapeHtml(e.title)}</span>
                  <span class="event-color-dot" style="background:${eventColor(e.id, colorIndexByEventId.get(e.id) ?? 0, e.color)}"></span>
                  ${e.source !== 'caldav' ? `<button class="event-delete-btn icon-btn" title="Удалить">${ICONS.action('trash-2')}</button>` : ''}
                </li>
              `,
                )
                .join('')}
            </ul>
          `
              : '<p class="empty-day-text">Нет событий</p>'
          }
        </div>
      `
          : `
        <p class="calendar-hint">${ICONS.action('calendar')} Выберите дату для просмотра событий</p>
      `
      }
    </div>
  `;
}
