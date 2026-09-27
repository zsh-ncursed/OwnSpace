import { describe, it, expect, beforeAll } from 'vitest';
import '../src/components/icons.js';
import { state } from '../src/state.js';
import { renderWidget } from '../src/render/grid.js';
import { setupWidgetListeners } from '../src/render/listeners.js';

// The bug: clicking a calendar's prev/next month button calls
// renderSingleWidget(), which replaces the widget element and calls
// setupWidgetListeners(newEl). That used container.querySelectorAll('.widget')
// — descendants only, never the container itself — so the freshly rendered
// card never got its mount() handlers and the buttons went dead after the
// first navigation.
describe('widget listeners survive a single-widget re-render', () => {
  const widget = {
    id: 'cal-nav',
    type: 'calendar',
    column: 0,
    order: 0,
    config: { events: [] },
  };

  beforeAll(() => {
    // jsdom does not implement CSS.escape (browsers do); widget ids are UUIDs,
    // so a plain passthrough is enough for the selector.
    if (typeof CSS === 'undefined') {
      globalThis.CSS = { escape: (s) => s };
    }
    state.activeWorkspaceId = 'ws-1';
    state.workspaces = [
      {
        id: 'ws-1',
        name: 'Main',
        widgets: [widget],
        background: { type: 'color', value: '#1a1a2e' },
      },
    ];
  });

  const mountCalendar = () => {
    document.body.innerHTML = '';
    const holder = document.createElement('div');
    holder.innerHTML = renderWidget(widget);
    const widgetEl = holder.firstElementChild;
    document.body.appendChild(widgetEl);
    // Normal grid path: the container is NOT the widget itself.
    setupWidgetListeners(document.body);
    return widgetEl;
  };

  const currentTitle = () =>
    document.querySelector('.calendar-title')?.textContent ?? '';

  it('mounts handlers on first render', () => {
    const widgetEl = mountCalendar();
    const titleBefore = widgetEl.querySelector('.calendar-title').textContent;

    widgetEl.querySelector('.prev-month').click();

    expect(currentTitle()).not.toBe(titleBefore);
  });

  it('keeps working after the re-render (the actual bug)', () => {
    mountCalendar();

    document.querySelector('.prev-month').click();
    const titleAfterFirst = currentTitle();

    // Second click lands on the FRESH element — must still shift the month.
    document.querySelector('.prev-month').click();
    const titleAfterSecond = currentTitle();

    expect(titleAfterSecond).not.toBe(titleAfterFirst);
  });

  it('keeps day-cell selection working after a re-render', () => {
    mountCalendar();

    document.querySelector('.next-month').click();
    const dayCell = document.querySelector('.calendar-day:not(.empty)');
    dayCell.click();
    expect(document.querySelector('.selected-day-panel')).not.toBeNull();

    // After the re-render triggered by selecting a day, cells must still react.
    document.querySelector('.next-month').click();
    expect(document.querySelector('.selected-day-panel')).toBeNull();
  });
});
