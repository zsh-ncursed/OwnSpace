import { state, getActiveWorkspace } from './state.js';
import { saveWorkspaces } from './storage.js';

export const sortableInstances = {};
export const widgetSortableInstances = {};

function setColumnSortablesDisabled(disabled) {
  Object.values(widgetSortableInstances).forEach((instance) => {
    instance.option('disabled', disabled);
  });
}

function setBookmarkSortablesDisabled(disabled) {
  Object.values(sortableInstances).forEach((instance) => {
    instance.option('disabled', disabled);
  });
}

function persistBookmarkOrder(widgetId, list) {
  const workspace = getActiveWorkspace();
  const widget = workspace?.widgets.find((w) => w.id === widgetId);
  if (!workspace || !widget || !list) return;

  const newOrder = [];
  list.querySelectorAll('.bookmark-item').forEach((item) => {
    const bm = widget.config.bookmarks.find(
      (b) => b.id === item.dataset.bookmarkId,
    );
    if (bm) newOrder.push(bm);
  });

  const workspaceIdx = state.workspaces.findIndex(
    (ws) => ws.id === workspace.id,
  );
  if (workspaceIdx === -1) return;
  const updatedWidgets = [...state.workspaces[workspaceIdx].widgets];
  const wi = updatedWidgets.findIndex((w) => w.id === widgetId);
  if (wi === -1) return;
  updatedWidgets[wi] = {
    ...updatedWidgets[wi],
    config: { ...updatedWidgets[wi].config, bookmarks: newOrder },
  };
  state.workspaces[workspaceIdx] = {
    ...state.workspaces[workspaceIdx],
    widgets: updatedWidgets,
  };
  saveWorkspaces(state.workspaces);
}

function persistWidgetLayoutFromGrid(grid) {
  const workspace = getActiveWorkspace();
  if (!workspace || !grid) return;

  const domState = [];
  grid.querySelectorAll('.widget-column').forEach((columnEl) => {
    const columnIndex = parseInt(columnEl.dataset.column, 10);
    columnEl.querySelectorAll('.widget').forEach((widgetEl, order) => {
      domState.push({
        id: widgetEl.dataset.widgetId,
        column: columnIndex,
        order,
      });
    });
  });

  const updatedWidgets = workspace.widgets.map((w) => {
    const domWidget = domState.find((dw) => dw.id === w.id);
    return domWidget
      ? { ...w, column: domWidget.column, order: domWidget.order }
      : w;
  });

  const workspaceIdx = state.workspaces.findIndex(
    (ws) => ws.id === workspace.id,
  );
  if (workspaceIdx === -1) return;
  state.workspaces[workspaceIdx] = {
    ...state.workspaces[workspaceIdx],
    widgets: updatedWidgets,
  };
  saveWorkspaces(state.workspaces);
}

function getTargetColumn(workspace) {
  const colCounts = [0, 0, 0, 0];
  workspace.widgets.forEach((w) => {
    let col = parseInt(w.column ?? 0, 10);
    if (isNaN(col) || col < 0 || col >= 4) {
      col = 0;
    }
    colCounts[col] = (colCounts[col] || 0) + 1;
  });
  return colCounts.indexOf(Math.min(...colCounts));
}

export {
  setColumnSortablesDisabled,
  setBookmarkSortablesDisabled,
  persistBookmarkOrder,
  persistWidgetLayoutFromGrid,
  getTargetColumn,
};
