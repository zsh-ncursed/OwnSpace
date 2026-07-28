import { WIDGET_TYPES } from '../utils/constants.js';
import { getActiveWorkspace } from '../state.js';
import { escapeHtml } from '../ui/escape.js';
import { getDefaultTitle, widgetBgStyle } from '../widgets/management.js';
import { renderNotesWidget } from '../widgets/notes.js';
import { renderDateTimeWidget } from '../widgets/datetime.js';
import { renderBookmarksWidget } from '../widgets/bookmarks.js';
import { renderTodoWidget } from '../widgets/todo.js';
import { renderWeatherWidget } from '../widgets/weather.js';
import { renderCalendarWidget } from '../widgets/calendar.js';
import { setupWidgetColumnSortable, setupAddWidgetListeners, setupWidgetListeners } from './listeners.js';

// Widget Grid Rendering
export function renderWidgetGrid() {
  const grid = document.getElementById('widget-grid');
  if (!grid) return;
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const bg = workspace.background || { type: 'color', value: '#1a1a2e' };
  let bgStyle = '';
  if (bg.type === 'color') {
    bgStyle = `background: ${bg.value};`;
  } else if (bg.type === 'gradient') {
    bgStyle = `background: ${bg.value};`;
  } else if (bg.type === 'image') {
    bgStyle = `background: url(${bg.value}) center/cover no-repeat;`;
  }

  const columns = [0, 1, 2, 3];
  const widgetsByCol = columns.map((col) =>
    workspace.widgets
      .filter((w) => (w.column ?? 0) === col)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );

  grid.innerHTML = `
    <div class="widget-grid" style="${bgStyle}">
      ${columns
        .map(
          (col) => `
        <div class="widget-column" data-column="${col}">
          ${widgetsByCol[col]
            .map((w) => renderWidget(w))
            .join('')}
        </div>
      `,
        )
        .join('')}
    </div>
    <div id="add-widget-menu" class="add-widget-menu" style="display:none;">
      <div class="widget-options">
        <button data-type="${WIDGET_TYPES.BOOKMARKS}">Закладки</button>
        <button data-type="${WIDGET_TYPES.NOTES}">Заметки</button>
        <button data-type="${WIDGET_TYPES.DATE}">Дата и время</button>
        <button data-type="${WIDGET_TYPES.WEATHER}">Погода</button>
        <button data-type="${WIDGET_TYPES.CALENDAR}">Календарь</button>
        <button data-type="${WIDGET_TYPES.TODO}">Список задач</button>
      </div>
      <button class="modal-close" id="close-menu">Отмена</button>
    </div>
    ${workspace.widgets.length === 0 ? `<div id="add-widget-empty-hint" class="add-widget-empty-hint"><span>${ICONS.btn('plus')} Добавить виджет</span></div>` : ''}
  `;

  setupWidgetColumnSortable();
  setupWidgetListeners(grid);
  setupAddWidgetListeners(grid);
}

export function renderWidget(widget) {
  const title = widget.config.title || getDefaultTitle(widget.type);
  const widgetId = widget.id;
  const pinned = widget.pinned || false;

  return `
    <div class="widget ${pinned ? 'widget-pinned' : ''}" data-widget-id="${widgetId}" ${widgetBgStyle(widget)}>
      <div class="widget-header ${pinned ? '' : 'widget-drag-handle'}" title="${pinned ? 'Виджет закреплён' : 'Перетащить виджет'}">
        <span class="widget-drag-grip" aria-hidden="true">${ICONS.action('grip-vertical')}</span>
        <span class="widget-title" data-default-title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <input type="text" class="widget-title-input" value="${escapeHtml(title)}" hidden />
        <div class="widget-actions">
          <button class="pin-widget-btn icon-btn" title="${pinned ? 'Открепить' : 'Закрепить'}" data-pinned="${pinned}">${ICONS.action(pinned ? 'pin' : 'pin-off')}</button>
          <button class="edit-title-btn icon-btn" title="Редактировать">${ICONS.action('pencil')}</button>
          <button class="remove-widget-btn icon-btn" title="Удалить" data-widget-id="${widgetId}">${ICONS.action('x')}</button>
        </div>
      </div>
      <div class="widget-content">${renderWidgetContent(widget)}</div>
    </div>
  `;
}

export function renderWidgetContent(widget) {
  switch (widget.type) {
    case WIDGET_TYPES.BOOKMARKS:
      return renderBookmarksWidget(widget);
    case WIDGET_TYPES.NOTES:
      return renderNotesWidget(widget);
    case WIDGET_TYPES.DATE:
      return renderDateTimeWidget(widget);
    case WIDGET_TYPES.TODO:
      return renderTodoWidget(widget);
    case WIDGET_TYPES.WEATHER:
      return renderWeatherWidget(widget);
    case WIDGET_TYPES.CALENDAR:
      return renderCalendarWidget(widget);
    default:
      return '<p>Unknown widget type</p>';
  }
}

export { setupWidgetColumnSortable, setupAddWidgetListeners };
