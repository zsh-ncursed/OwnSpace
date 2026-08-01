import { escapeHtml } from '../ui/escape.js';
import { t } from '../i18n/index.js';

export const WIDGET_TYPE = 'todo';

export function addTask(tasks, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return tasks;
  return [...tasks, { id: crypto.randomUUID(), text: trimmed, done: false }];
}

export function toggleTask(tasks, taskId) {
  return tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
}

export function renameTask(tasks, taskId, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return tasks;
  return tasks.map((t) => (t.id === taskId ? { ...t, text: trimmed } : t));
}

export function deleteTask(tasks, taskId) {
  return tasks.filter((t) => t.id !== taskId);
}

export function renderTodoWidget(widget) {
  const tasks = widget.config.tasks || [];
  const pending = tasks.filter((t) => !t.done).length;

  return `
    <div class="todo-widget" data-widget-id="${widget.id}">
      <div class="todo-stats">${t('widget.todo.remaining', { count: pending })}</div>
      <div class="todo-list">
        ${tasks
          .map(
            (t) => `
          <div class="todo-item ${t.done ? 'todo-done' : ''}" data-task-id="${t.id}">
            <input type="checkbox" class="todo-checkbox" ${t.done ? 'checked' : ''} />
            <input type="text" class="todo-text" value="${escapeHtml(t.text)}" ${t.done ? 'readonly' : ''} />
            <button class="todo-delete icon-btn" title="${t('common.delete')}">${ICONS.action('trash-2')}</button>
          </div>
        `,
          )
          .join('')}
      </div>
      <div class="todo-add-row">
        <input type="text" class="todo-new-input" placeholder="${t('widget.todo.add_placeholder')}" />
        <button class="todo-add-btn icon-btn" title="${t('widget.todo.add_btn')}" aria-label="${t('widget.todo.add_btn')}">${ICONS.btn('plus')}</button>
      </div>
    </div>
  `;
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.todo.title',
  icon: 'list-checks',
  defaultConfig: { tasks: [], title: '' },
  render: renderTodoWidget,
};
