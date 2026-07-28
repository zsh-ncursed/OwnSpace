import { escapeHtml } from '../ui/escape.js';

export function renderNotesWidget(widget) {
  const content = widget.config.content || '';
  return `
    <div class="notes-widget" data-widget-id="${widget.id}">
      <textarea placeholder="Введите заметку...">${escapeHtml(content)}</textarea>
    </div>
  `;
}
