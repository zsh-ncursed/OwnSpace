/**
 * Ephemeral calendar view state: which month is being looked at and which day
 * is selected.
 *
 * Deliberately NOT stored in widget.config — config is persisted to
 * browser.storage, so a month the user navigated to would survive a reload and
 * every new tab would open on that stale month instead of the current one.
 * Keyed by widget id, so several calendar widgets keep independent views
 * within one page, and each tab starts fresh on the current month.
 */

const _views = new Map();

/**
 * View state for a widget. Falls back to the current month (computed at call
 * time, so a long-lived tab rolls over into the next month by itself).
 */
export function getCalendarView(widgetId, now = new Date()) {
  const stored = _views.get(widgetId);
  if (stored) return { ...stored };
  return {
    viewYear: now.getFullYear(),
    viewMonth: now.getMonth(),
    selectedDay: null,
  };
}

/** Merge updates into the view state and return the result. */
export function setCalendarView(widgetId, updates) {
  const next = { ...getCalendarView(widgetId), ...updates };
  _views.set(widgetId, next);
  return { ...next };
}

/** Drop view state for a removed widget. */
export function clearCalendarView(widgetId) {
  _views.delete(widgetId);
}

/** Drop all view state (widget teardown / tests). */
export function clearAllCalendarViews() {
  _views.clear();
}
