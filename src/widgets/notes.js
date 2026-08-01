import { escapeHtml } from '../ui/escape.js';
import { t } from '../i18n/index.js';

export const WIDGET_TYPE = 'notes';

export function renderNotesWidget(widget) {
  const content = widget.config.content || '';
  return `
    <div class="notes-widget" data-widget-id="${widget.id}">
      <textarea placeholder="${t('widget.notes.placeholder')}">${escapeHtml(content)}</textarea>
    </div>
  `;
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.notes.title',
  icon: 'file-text',
  defaultConfig: { content: '', title: '' },
  render: renderNotesWidget,
};
