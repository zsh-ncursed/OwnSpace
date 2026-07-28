import { WIDGET_TYPES } from './utils/constants.js';
import { state } from './state.js';
import { getWorkspaces, saveWorkspaces, saveActiveWorkspaceId, getActiveWorkspaceId } from './storage.js';
import { migrateEvent } from './widgets/calendar.js';
import { renderWorkspaceTabs } from './render/tabs.js';
import { renderWidgetGrid } from './render/grid.js';

export async function loadWorkspaces() {
  let ws = await getWorkspaces();

  if (!Array.isArray(ws) || ws.length === 0) {
    ws = [
      {
        id: crypto.randomUUID(),
        name: 'Добро пожаловать',
        background: { type: 'color', value: '#1a1a2e' },
        widgets: [],
      },
    ];
    await saveWorkspaces(ws);
  }

  const seen = new Set();
  const unique = [];
  for (const workspace of ws) {
    if (!workspace || !workspace.id || seen.has(workspace.id)) continue;
    seen.add(workspace.id);
    unique.push(workspace);
  }
  if (unique.length !== ws.length) {
    ws = unique;
    await saveWorkspaces(ws);
  }

  let changed = false;
  let namelessCount = 0;
  ws.forEach((workspace) => {
    if (!workspace.widgets) {
      workspace.widgets = [];
      changed = true;
    }
    if (!workspace.background) {
      workspace.background = { type: 'color', value: '#1a1a2e' };
      changed = true;
    }
    if (!workspace.name) {
      namelessCount++;
      workspace.name = `Без названия ${namelessCount > 1 ? namelessCount : ''}`.trim();
      changed = true;
    }
    workspace.widgets.forEach((w, idx) => {
      if (w.column === undefined || w.column === null) {
        w.column = 0;
        changed = true;
      }
      if (w.order === undefined || w.order === null) {
        w.order = idx;
        changed = true;
      }
      if (w.pinned === undefined) {
        w.pinned = false;
        changed = true;
      }
    });
  });

  for (const workspace of ws) {
    for (const widget of workspace.widgets || []) {
      if (widget.type !== WIDGET_TYPES.CALENDAR) continue;
      const events = widget.config?.events || [];
      const migrated = events.map((e) => migrateEvent(e)).filter(Boolean);
      const sameLen = migrated.length === events.length;
      const sameShape = events.every(
        (e, i) =>
          e === migrated[i] ||
          (e.date === migrated[i].date &&
            (e.time || null) === (migrated[i].time || null)),
      );
      if (!sameLen || !sameShape) {
        widget.config = { ...(widget.config || {}), events: migrated };
        changed = true;
      }
    }
  }

  for (const workspace of ws) {
    for (const widget of workspace.widgets || []) {
      if (widget.type !== WIDGET_TYPES.WEATHER) continue;
      if (!widget.config) widget.config = {};
      if (!widget.config.city) {
        widget.config.city = 'Moscow';
        changed = true;
      }
      if (typeof widget.config.apiKey === 'string') {
        const m = widget.config.apiKey.match(
          /^[A-Za-z_][A-Za-z0-9_-]*=(.+)$/,
        );
        if (m) {
          widget.config.apiKey = m[1].trim();
          changed = true;
        }
      }
    }
  }

  if (changed) await saveWorkspaces(ws);

  state.workspaces = ws;
  const savedActiveId = await getActiveWorkspaceId();
  if (savedActiveId && ws.some((w) => w.id === savedActiveId)) {
    state.activeWorkspaceId = savedActiveId;
  } else if (ws.length > 0 && !state.activeWorkspaceId) {
    state.activeWorkspaceId = ws[0].id;
  }
}

export async function addWorkspace() {
  if (state.workspaces.length >= 10) return;
  const newWs = {
    id: crypto.randomUUID(),
    name: 'Новое пространство',
    background: { type: 'color', value: '#1a1a2e' },
    widgets: [],
  };
  const updated = [...state.workspaces, newWs];
  await saveWorkspaces(updated);
  state.workspaces = updated;
  state.activeWorkspaceId = newWs.id;
  await saveActiveWorkspaceId(newWs.id);
  renderWorkspaceTabs();
  renderWidgetGrid();
}

export async function updateWorkspace(id, updates) {
  const updated = state.workspaces.map((ws) =>
    ws.id === id ? { ...ws, ...updates } : ws,
  );
  await saveWorkspaces(updated);
  state.workspaces = updated;
  if ('name' in updates) renderWorkspaceTabs();
  renderWidgetGrid();
}

export async function deleteWorkspace(id) {
  if (state.workspaces.length <= 1) return;
  const updated = state.workspaces.filter((ws) => ws.id !== id);
  await saveWorkspaces(updated);
  state.workspaces = updated;
  if (state.activeWorkspaceId === id) {
    state.activeWorkspaceId = updated[0]?.id;
    if (state.activeWorkspaceId) {
      await saveActiveWorkspaceId(state.activeWorkspaceId);
    }
  }
  renderWorkspaceTabs();
  renderWidgetGrid();
}
