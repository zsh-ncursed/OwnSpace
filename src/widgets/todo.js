import { escapeHtml } from '../ui/escape.js';
import { t } from '../i18n/index.js';
import { getActiveWorkspace } from '../state.js';
import { updateWidgetConfig } from './management.js';
import { renderSingleWidget } from '../render/listeners.js';

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

function getTodoWidget(widgetId) {
  const ws = getActiveWorkspace();
  return ws?.widgets.find((w) => w.id === widgetId);
}

export function mountTodoWidget(el, widget) {
  const widgetId = widget.id;

  const todoAddBtn = el.querySelector('.todo-add-btn');
  if (todoAddBtn) {
    todoAddBtn.addEventListener('click', () => {
      const input = el.querySelector('.todo-new-input');
      const w = getTodoWidget(widgetId);
      if (!w) return;
      const tasks = addTask(w.config.tasks || [], input.value);
      if (tasks === w.config.tasks) return;
      updateWidgetConfig(widgetId, { tasks }, true);
      input.value = '';
      renderSingleWidget(widgetId);
    });
  }
  const todoNewInput = el.querySelector('.todo-new-input');
  if (todoNewInput) {
    todoNewInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        todoAddBtn?.click();
      }
    });
  }

  el.querySelectorAll('.todo-item').forEach((item) => {
    const taskId = item.dataset.taskId;

    item
      .querySelector('.todo-checkbox')
      .addEventListener('change', () => {
        const w = getTodoWidget(widgetId);
        if (!w) return;
        const tasks = toggleTask(w.config.tasks || [], taskId);
        updateWidgetConfig(widgetId, { tasks }, true);
        renderSingleWidget(widgetId);
      });

    item.querySelector('.todo-text').addEventListener('change', () => {
      const text = item.querySelector('.todo-text').value;
      const w = getTodoWidget(widgetId);
      if (!w) return;
      const tasks = renameTask(w.config.tasks || [], taskId, text);
      updateWidgetConfig(widgetId, { tasks }, true);
    });

    item.querySelector('.todo-delete').addEventListener('click', () => {
      const w = getTodoWidget(widgetId);
      if (!w) return;
      const tasks = deleteTask(w.config.tasks || [], taskId);
      updateWidgetConfig(widgetId, { tasks }, true);
      renderSingleWidget(widgetId);
    });
  });
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.todo.title',
  icon: 'list-checks',
  defaultConfig: { tasks: [], title: '' },
  render: renderTodoWidget,
  mount: mountTodoWidget,
};
