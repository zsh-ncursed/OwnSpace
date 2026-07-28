import { escapeHtml } from '../ui/escape.js';

export const WIDGET_TYPE = 'todo';

export function renderTodoWidget(widget) {
  const tasks = widget.config.tasks || [];
  const pending = tasks.filter((t) => !t.done).length;

  return `
    <div class="todo-widget" data-widget-id="${widget.id}">
      <div class="todo-stats">Осталось: ${pending}</div>
      <div class="todo-list">
        ${tasks
          .map(
            (t) => `
          <div class="todo-item ${t.done ? 'todo-done' : ''}" data-task-id="${t.id}">
            <input type="checkbox" class="todo-checkbox" ${t.done ? 'checked' : ''} />
            <input type="text" class="todo-text" value="${escapeHtml(t.text)}" ${t.done ? 'readonly' : ''} />
            <button class="todo-delete icon-btn" title="Удалить">${ICONS.action('trash-2')}</button>
          </div>
        `,
          )
          .join('')}
      </div>
      <div class="todo-add-row">
        <input type="text" class="todo-new-input" placeholder="Новая задача..." />
        <button class="todo-add-btn icon-btn" title="Добавить задачу" aria-label="Добавить задачу">${ICONS.btn('plus')}</button>
      </div>
    </div>
  `;
}

export default {
  type: WIDGET_TYPE,
  title: 'Список задач',
  icon: 'list-checks',
  defaultConfig: { tasks: [], title: 'Список задач' },
  render: renderTodoWidget,
};
