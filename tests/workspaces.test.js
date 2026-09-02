import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storage } from '../src/storage.js';
import { STORAGE_KEYS } from '../src/utils/constants.js';
import { loadWorkspaces } from '../src/workspaces.js';
import { state } from '../src/state.js';
import { renderWidgetGrid } from '../src/render/grid.js';
import { clearAllCalendarViews } from '../src/widgets/calendar-view.js';
import { initLocale } from '../src/i18n/index.js';

function calendarWorkspace(config) {
  return [
    {
      id: 'ws1',
      name: 'Main',
      background: { type: 'color', value: '#1a1a2e' },
      widgets: [
        {
          id: 'cal1',
          type: 'calendar',
          column: 0,
          order: 0,
          pinned: false,
          config,
        },
      ],
    },
  ];
}

async function storedCalendarConfig() {
  const ws = await storage.local.getItem(STORAGE_KEYS.WORKSPACES);
  return ws[0].widgets[0].config;
}

describe('loadWorkspaces: legacy calendar view state', () => {
  beforeEach(() => {
    state.workspaces = [];
    state.activeWorkspaceId = null;
  });

  it('strips persisted viewYear/viewMonth/selectedDay from calendar configs', async () => {
    await storage.local.setItem(
      STORAGE_KEYS.WORKSPACES,
      calendarWorkspace({
        events: [],
        title: 'My calendar',
        showWeather: true,
        viewYear: 2020,
        viewMonth: 3,
        selectedDay: 11,
      }),
    );

    await loadWorkspaces();

    const config = state.workspaces[0].widgets[0].config;
    expect(config).not.toHaveProperty('viewYear');
    expect(config).not.toHaveProperty('viewMonth');
    expect(config).not.toHaveProperty('selectedDay');
    // Unrelated config survives.
    expect(config.title).toBe('My calendar');
    expect(config.showWeather).toBe(true);
  });

  it('persists the stripped config so the keys do not come back', async () => {
    await storage.local.setItem(
      STORAGE_KEYS.WORKSPACES,
      calendarWorkspace({ events: [], viewYear: 2020, viewMonth: 3 }),
    );

    await loadWorkspaces();

    const config = await storedCalendarConfig();
    expect(config).not.toHaveProperty('viewYear');
    expect(config).not.toHaveProperty('viewMonth');
  });

  it('leaves configs without legacy keys untouched', async () => {
    await storage.local.setItem(
      STORAGE_KEYS.WORKSPACES,
      calendarWorkspace({ events: [], title: '', showWeather: false }),
    );

    await loadWorkspaces();

    expect(await storedCalendarConfig()).toEqual({
      events: [],
      title: '',
      showWeather: false,
    });
  });
});

describe('regression: calendar opens on the current month after a reload', () => {
  beforeEach(() => {
    state.workspaces = [];
    state.activeWorkspaceId = null;
    clearAllCalendarViews();
    vi.stubGlobal('ICONS', {
      action: (name) => `<svg data-icon="${name}"></svg>`,
      btn: (name) => `<svg data-icon="${name}"></svg>`,
    });
    vi.stubGlobal('Sortable', undefined);
  });

  it('ignores a month the previous session had navigated to', async () => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    await initLocale();
    await storage.local.setItem(
      STORAGE_KEYS.WORKSPACES,
      calendarWorkspace({
        events: [],
        title: '',
        showWeather: false,
        viewYear: prev.getFullYear(),
        viewMonth: prev.getMonth(),
        selectedDay: 12,
      }),
    );
    await storage.local.setItem(STORAGE_KEYS.ACTIVE_WORKSPACE, 'ws1');

    document.body.innerHTML = '<div id="widget-grid"></div>';
    await loadWorkspaces();
    renderWidgetGrid();

    const title = document
      .querySelector('.calendar-title')
      .textContent.trim();
    const expected = `${new Date(now.getFullYear(), now.getMonth(), 1)
      .toLocaleString('en', { month: 'long' })} ${now.getFullYear()}`;
    expect(title).toBe(expected);
    expect(document.querySelectorAll('.calendar-day.today')).toHaveLength(1);
    // No day panel opens from a stale persisted selection.
    expect(document.querySelector('.selected-day-panel')).toBeNull();
  });
});
