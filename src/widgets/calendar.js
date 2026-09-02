import { escapeHtml } from '../ui/escape.js';
import { pad2, timeAgo, eventDateKey } from '../utils/date.js';
import { t, getLang } from '../i18n/index.js';
import { weatherForDay } from './calendar-weather.js';
import { getCalendarView } from './calendar-view.js';

export const WIDGET_TYPE = 'calendar';

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
  if (e.moneyType === 'income' || e.moneyType === 'expense') result.moneyType = e.moneyType;
  if (typeof e.money === 'number' && isFinite(e.money)) result.money = e.money;
  return result;
}

export function eventColor(_id, index, customColor) {
  if (customColor) return customColor;
  const hue = ((index ?? 0) * 137.508) % 360;
  return `hsl(${hue} 70% 58%)`;
}

export function shiftMonth(viewYear, viewMonth, delta) {
  let m = viewMonth + delta;
  let y = viewYear;
  if (m < 0) { m = 11; y--; }
  else if (m > 11) { m = 0; y++; }
  return { viewYear: y, viewMonth: m, selectedDay: null };
}

export function deleteEvent(events, eventId, isRecurring, choice) {
  if (!isRecurring) {
    return events.filter((e) => e.id !== eventId);
  }
  if (choice === 'all') {
    const event = events.find((e) => e.id === eventId);
    const parentId = event?.recurringParentId || event?.id || eventId;
    return events.filter((e) =>
      !(e.recurringParentId === parentId || e.id === parentId),
    );
  }
  return events.filter((e) => e.id !== eventId);
}

export function advanceDate(date, type, interval) {
  switch (type) {
    case 'seconds':
      date.setSeconds(date.getSeconds() + interval);
      break;
    case 'minutes':
      date.setMinutes(date.getMinutes() + interval);
      break;
    case 'hours':
      date.setHours(date.getHours() + interval);
      break;
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
  if (!r || r.type === 'none') return false;
  if (r.interval > 1) return true;
  if (r.endDate) return true;
  return false;
}

/**
 * Calculate monthly financial result from events.
 * @param events - events of the VIEWED month (already filtered by month)
 * @param viewYear/viewMonth - the month being viewed
 * @param now - current time (for "started" check)
 * Past months: all events count. Current month: only started events. Future: none.
 */
export function calcMonthFinance(events, viewYear, viewMonth, now = new Date()) {
  const nowMs = now.getTime();
  const todayDateStr = eventDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const isCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const isPastMonth =
    viewYear < now.getFullYear() ||
    (viewYear === now.getFullYear() && viewMonth < now.getMonth());

  let income = 0;
  let expense = 0;
  for (const e of events) {
    if (e.source === 'caldav') continue;
    if (typeof e.money !== 'number' || !isFinite(e.money) || e.money <= 0) continue;
    if (!e.date) continue;
    if (isPastMonth) {
      // all events in a past month have started
    } else if (!isCurrentMonth) {
      continue; // future month — nothing started yet
    } else {
      // current month — check started
      const started = e.time
        ? (() => {
            const [y, m, d] = e.date.split('-').map(Number);
            const [hh, mm] = e.time.split(':').map(Number);
            if (!y || !m || !d) return false;
            const ms = new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
            return !isNaN(ms) && ms <= nowMs;
          })()
        : e.date <= todayDateStr;
      if (!started) continue;
    }
    if (e.moneyType === 'income') income += e.money;
    else expense += e.money;
  }
  return { income, expense, net: income - expense, hasMoney: income > 0 || expense > 0 };
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
      moneyType: baseEvent.moneyType || null,
      money: typeof baseEvent.money === 'number' ? baseEvent.money : null,
    };

    instances.push(instance);
    count++;

    advanceDate(current, recurringConfig.type, recurringConfig.interval);
  }

  return instances;
}

export function upsertEventWithRecurring(events, newEvent) {
  const updated = (events || []).filter(
    (e) => e.recurringParentId !== newEvent.id,
  );
  const idx = updated.findIndex((e) => e.id === newEvent.id);
  if (idx !== -1) {
    updated[idx] = newEvent;
  } else {
    updated.push(newEvent);
  }
  if (newEvent.recurring && newEvent.recurring.type !== 'none') {
    updated.push(...generateRecurringEvents(newEvent, newEvent.recurring));
  }
  return updated;
}

export function renderCalendarWidget(widget) {
  const now = new Date();
  // View state is ephemeral (per-tab), never read from persisted config — a
  // fresh tab always opens on the current month.
  const { viewYear, viewMonth, selectedDay } = getCalendarView(widget.id, now);
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString(getLang(), {
    month: 'long',
  });
  const firstDayRaw = new Date(viewYear, viewMonth, 1).getDay();
  const firstDay = firstDayRaw === 0 ? 6 : firstDayRaw - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isViewingCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const todayDay = isViewingCurrentMonth ? now.getDate() : null;
  const monthPrefix = `${viewYear}-${pad2(viewMonth + 1)}`;
  const showWeather = !!widget.config.showWeather;

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const events = (widget.config.events || [])
    .map(migrateEvent)
    .filter(Boolean);
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

  // Financial result for current month via pure helper.
  const { income: monthIncome, expense: monthExpense, net: monthNet, hasMoney: hasAnyMoney } =
    calcMonthFinance(monthEventsSorted, viewYear, viewMonth, now);
  const fmtMoney = (v) => {
    const sign = v < 0 ? '−' : '';
    const abs = Math.abs(v);
    const s = abs % 1 === 0 ? abs.toString() : abs.toFixed(2);
    return `${sign}${s} ₽`;
  };

  return `
    <div class="calendar-widget" data-widget-id="${widget.id}">
      <div class="calendar-nav">
        <button class="prev-month icon-btn" title="${t('widget.calendar.prev_month')}">${ICONS.action('chevron-left')}</button>
        <span class="calendar-title">${monthName} ${viewYear}</span>
        <button class="next-month icon-btn" title="${t('widget.calendar.next_month')}">${ICONS.action('chevron-right')}</button>
      </div>
      <div class="calendar-grid">
        ${t('widget.calendar.day_headers').split(',')
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
                            title="${escapeHtml(e.title)} · ${e.time}${isRecurring ? t('calendar.recurring_hint') : ''}"></div>`;
              })
              .join('');
            const overflowHtml =
              overflow > 0
                ? `<span class="event-overflow">+${overflow}</span>`
                : '';

            let weatherHtml = '';
            if (day && showWeather && viewYear === now.getFullYear() && viewMonth === now.getMonth()) {
              const wDate = new Date(viewYear, viewMonth, day);
              const wd = weatherForDay(wDate);
              if (wd) {
                const todayKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
                const thisKey = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
                if (thisKey === todayKey && wd.temp != null) {
                  weatherHtml = `<span class="cal-weather"><span class="cal-weather-icon" data-icon="${wd.icon}">${ICONS.btn(wd.icon)}</span><span class="cal-weather-temp">${wd.temp}°</span></span>`;
                } else if (wd.min != null && wd.max != null) {
                  weatherHtml = `<span class="cal-weather"><span class="cal-weather-icon" data-icon="${wd.icon}">${ICONS.btn(wd.icon)}</span><span class="cal-weather-range">${wd.min}°/${wd.max}°</span></span>`;
                }
              }
            }

            return `
              <div class="${classes.join(' ')}" data-day="${day || ''}" ${cellStyle}>
                <span class="calendar-day-num">${day || ''}</span>
                ${weatherHtml}
                ${timedEvents.length > 0 ? `<div class="event-bars">${bars}${overflowHtml}</div>` : ''}
              </div>
            `;
          })
          .join('')}
      </div>
      <div class="caldav-sync-row">
        <button class="caldav-sync-btn icon-btn" title="${t('widget.calendar.caldav_sync')}" aria-label="${t('widget.calendar.caldav_sync')}">${ICONS.action('rotate-cw')}</button>
        <span class="caldav-sync-status">${widget.config.caldavCalendarName ? (widget.config.caldavLastSync ? timeAgo(widget.config.caldavLastSync) : t('widget.calendar.caldav_sync_prompt')) : ''}</span>
      </div>
      ${
        selectedDay
          ? `
        <div class="selected-day-panel">
          <div class="selected-day-header">
            <span>${selectedDay} ${monthName}</span>
            <button class="add-event-btn icon-btn" title="${t('widget.calendar.add_event')}">${ICONS.btn('plus')}</button>
          </div>
          ${
            selectedDate.length > 0
              ? `
            <ul class="selected-day-events">
              ${selectedDate
                .map(
                  (e) => `
                <li data-event-id="${e.id}" class="event-item ${e.source === 'caldav' ? 'event-item-caldav' : ''}" title="${e.source === 'caldav' ? t('widget.calendar.event_caldav_readonly') : t('widget.calendar.event_click_to_edit')}">
                  ${e.time ? `<span class="event-time">${e.time}</span>` : `<span class="event-time event-time-allday">${t('widget.calendar.all_day')}</span>`}
                  ${e.source === 'caldav' ? `<span class="caldav-badge">${t('widget.calendar.caldav_badge')}</span>` : ''}
                  ${(e.recurring && e.recurring.type && e.recurring.type !== 'none') || e.isRecurringInstance ? `<span class="event-recurring-badge" title="${t('widget.calendar.recurring_badge')}">↻</span>` : ''}
                  <span class="event-title">${escapeHtml(e.title)}</span>
                  <span class="event-color-dot" style="background:${eventColor(e.id, colorIndexByEventId.get(e.id) ?? 0, e.color)}"></span>
                  ${e.source !== 'caldav' ? `<button class="event-delete-btn icon-btn" title="${t('common.delete')}">${ICONS.action('trash-2')}</button>` : ''}
                </li>
              `,
                )
                .join('')}
            </ul>
          `
              : `<p class="empty-day-text">${t('widget.calendar.no_events')}</p>`
          }
        </div>
      `
          : `
        <p class="calendar-hint">${ICONS.action('calendar')} ${t('widget.calendar.select_date')}</p>
      `
      }
      ${hasAnyMoney ? `
        <div class="calendar-money-result" data-net="${monthNet >= 0 ? 'positive' : 'negative'}">
          <span class="calendar-money-label">${t('widget.calendar.finance_label')}</span>
          <span class="calendar-money-net">${fmtMoney(monthNet)}</span>
          <span class="calendar-money-breakdown">
            <span class="calendar-money-income">+ ${fmtMoney(monthIncome)}</span>
            <span class="calendar-money-expense">− ${fmtMoney(monthExpense)}</span>
          </span>
        </div>
      ` : ''}
    </div>
  `;
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.calendar.title',
  icon: 'calendar',
  defaultConfig: { events: [], title: '', showWeather: false },
  render: renderCalendarWidget,
};
