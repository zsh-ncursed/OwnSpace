import { getActiveWorkspace } from '../state.js';
import { escapeHtml } from '../ui/escape.js';
import { getDefaultTitle, widgetBgStyle } from '../widgets/management.js';
import { widgetRegistry } from '../widgets/registry.js';
import { setupWidgetColumnSortable, setupAddWidgetListeners, setupWidgetListeners } from './listeners.js';
import { t } from '../i18n/index.js';

export function renderWidgetGrid() {
  const container = document.getElementById('widget-grid');
  if (!container) return;
  const workspace = getActiveWorkspace();
  if (!workspace) {
    container.innerHTML = '<div class="workspace"><p>' + t('empty.loading') + '</p></div>';
    return;
  }

  const widgets = workspace.widgets || [];
  const bg = workspace.background || { type: 'color', value: '#1a1a2e' };

  let bgValue;
  if (bg.type === 'color') bgValue = bg.value;
  else if (bg.type === 'gradient') bgValue = bg.value;
  else if (bg.type === 'image') bgValue = `url(${bg.value}) center/cover no-repeat`;
  else bgValue = 'var(--bg)';

  const enabledPlugins = widgetRegistry.getEnabled();
  const menuButtons = enabledPlugins
    .map((p) => `<button data-type="${p.type}">${t(p.title)}</button>`)
    .join('');

  container.className = 'widget-grid widget-grid-layout';
  container.style.cssText = `display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 16px !important; padding: 20px; flex: 1; min-height: 0; overflow: auto; background: ${bgValue};`;

  if (widgets.length === 0) {
    const emptyCols = [0, 1, 2, 3]
      .map((i) => `<div class="widget-column" data-column="${i}"></div>`)
      .join('');
    container.innerHTML = `
      ${emptyCols}
      <div class="empty-state-hint" id="add-widget-empty-hint">
        ${ICONS.btn('plus')}
        <span><kbd>+</kbd> ${t('empty.hint_add_widget')}</span>
      </div>
      <div id="add-widget-menu" class="modal-overlay" style="display: none;">
        <div class="modal">
          <h3>${t('empty.add_widget_title')}</h3>
          <div class="widget-options">
            ${menuButtons}
          </div>
          <button class="modal-close" id="close-menu">${t('common.cancel')}</button>
        </div>
      </div>
    `;
    setupWidgetColumnSortable();
    setupWidgetListeners(container);
    setupAddWidgetListeners(container);
    return;
  }

  const columns = [[], [], [], []];
  widgets.forEach((w) => {
    const col = w.column ?? 0;
    if (col >= 0 && col < 4) columns[col].push(w);
    else columns[0].push(w);
  });
  columns.forEach((col) => col.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  const columnsHTML = columns
    .map((colWidgets, idx) => `
      <div class="widget-column" data-column="${idx}">
        ${colWidgets.map((w) => renderWidget(w)).join('')}
      </div>
    `)
    .join('');

  container.innerHTML = `
    ${columnsHTML}
    <div id="add-widget-menu" class="modal-overlay" style="display: none;">
      <div class="modal">
        <h3>${t('empty.add_widget_title')}</h3>
        <div class="widget-options">
          ${menuButtons}
        </div>
        <button class="modal-close" id="close-menu">${t('common.cancel')}</button>
      </div>
    </div>
  `;

  setupWidgetColumnSortable();
  setupWidgetListeners(container);
  setupAddWidgetListeners(container);
}

export function renderWidget(widget) {
  const title = widget.config.title || getDefaultTitle(widget.type);
  const widgetId = widget.id;
  const pinned = widget.pinned || false;

  return `
    <div class="widget ${pinned ? 'widget-pinned' : ''}" data-widget-id="${widgetId}" ${widgetBgStyle(widget)}>
      <div class="widget-header ${pinned ? '' : 'widget-drag-handle'}" title="${pinned ? t('widget.pinned') : t('widget.drag')}">
        <span class="widget-drag-grip" aria-hidden="true">${ICONS.action('grip-vertical')}</span>
        <span class="widget-title" data-default-title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <input type="text" class="widget-title-input" value="${escapeHtml(title)}" hidden />
        <div class="widget-actions">
          <button class="pin-widget-btn icon-btn" title="${pinned ? t('widget.unpin') : t('widget.pin')}" data-pinned="${pinned}">${ICONS.action(pinned ? 'pin' : 'pin-off')}</button>
          <button class="edit-title-btn icon-btn" title="${t('widget.edit_title')}">${ICONS.action('pencil')}</button>
          <button class="remove-widget-btn icon-btn" title="${t('widget.remove')}" data-widget-id="${widgetId}">${ICONS.action('x')}</button>
        </div>
      </div>
      <div class="widget-content">${renderWidgetContent(widget)}</div>
    </div>
  `;
}

export function renderWidgetContent(widget) {
  const plugin = widgetRegistry.get(widget.type);
  if (plugin && plugin.render) {
    return plugin.render(widget);
  }
  return '<p>' + t('empty.no_widget_type') + '</p>';
}
