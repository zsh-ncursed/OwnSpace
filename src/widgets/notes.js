import { escapeHtml } from '../ui/escape.js';
import { t } from '../i18n/index.js';
import { updateWidgetConfig } from './management.js';

export const WIDGET_TYPE = 'notes';

export function renderNotesWidget(widget) {
  const content = widget.config.content || '';
  return `
    <div class="notes-widget" data-widget-id="${widget.id}">
      <textarea placeholder="${t('widget.notes.placeholder')}">${escapeHtml(content)}</textarea>
    </div>
  `;
}

// Debounced autosave for the notes textarea.
export function mountNotesWidget(el, widget) {
  const textarea = el.querySelector('textarea');
  if (!textarea) return;
  const widgetId = widget.id;
  let saveTimeout;
  textarea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      updateWidgetConfig(widgetId, { content: textarea.value }, true);
    }, 500);
  });
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.notes.title',
  icon: 'file-text',
  defaultConfig: { content: '', title: '' },
  render: renderNotesWidget,
  mount: mountNotesWidget,
};
