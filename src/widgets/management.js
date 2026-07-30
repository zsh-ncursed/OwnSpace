import { state, getActiveWorkspace } from '../state.js';
import { saveWorkspaces } from '../storage.js';
import { getTargetColumn, sortableInstances } from '../sortable.js';
import { updateWorkspace } from '../workspaces.js';
import { renderWidgetGrid } from '../render/grid.js';
import { widgetRegistry } from './registry.js';

export function getDefaultTitle(type) {
  const plugin = widgetRegistry.get(type);
  return plugin ? plugin.title : 'Widget';
}

export function getDefaultWidgetConfig(type) {
  const plugin = widgetRegistry.get(type);
  return plugin ? { ...plugin.defaultConfig } : {};
}

export function widgetBgStyle(widget) {
  const cfg = widget.config || {};
  const color = cfg.bgColor;
  const opacity = cfg.opacity != null ? cfg.opacity : 100;
  if (!color && opacity >= 100) return '';
  if (!color) {
    const bgVar = 'var(--surface)';
    const o = Math.round((opacity / 100) * 255)
      .toString(16)
      .padStart(2, '0');
    return `style="background:${bgVar}${opacity < 100 ? o : ''}"`;
  }
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const a = opacity / 100;
  return `style="background:rgba(${r},${g},${b},${a})"`;
}

export function addWidget(type) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const targetCol = getTargetColumn(workspace);
  const colWidgets = workspace.widgets.filter(
    (w) => (w.column ?? 0) === targetCol,
  );

  const config = getDefaultWidgetConfig(type);

  const newWidget = {
    id: crypto.randomUUID(),
    type,
    column: targetCol,
    order: colWidgets.length,
    pinned: false,
    config,
  };

  updateWorkspace(workspace.id, {
    widgets: [...workspace.widgets, newWidget],
  });
}

export function removeWidget(widgetId) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const bookmarkExpanded = window._bookmarkExpanded || {};
  delete bookmarkExpanded[widgetId];
  if (sortableInstances[widgetId]) {
    sortableInstances[widgetId].destroy();
    delete sortableInstances[widgetId];
  }
  const updated = workspace.widgets.filter((w) => w.id !== widgetId);
  updateWorkspace(workspace.id, { widgets: updated });
}

export function updateWidgetConfig(widgetId, config, skipRender) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;
  const updatedWorkspaces = state.workspaces.map((ws) => {
    if (ws.id !== workspace.id) return ws;
    return {
      ...ws,
      widgets: ws.widgets.map((w) =>
        w.id === widgetId ? { ...w, config: { ...w.config, ...config } } : w,
      ),
    };
  });
  state.workspaces = updatedWorkspaces;
  saveWorkspaces(updatedWorkspaces);
  if (!skipRender) renderWidgetGrid();
}
