import { escapeHtml } from '../ui/escape.js';

export const WIDGET_TYPE = 'notes';

export function renderNotesWidget(widget) {
  const content = widget.config.content || '';
  return `
    <div class="notes-widget" data-widget-id="${widget.id}">
      <textarea placeholder="Введите заметку...">${escapeHtml(content)}</textarea>
    </div>
  `;
}

export default {
  type: WIDGET_TYPE,
  title: 'Заметки',
  icon: 'file-text',
  defaultConfig: { content: '', title: 'Заметки' },
  render: renderNotesWidget,
};
