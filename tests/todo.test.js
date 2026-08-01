import { describe, it, expect } from 'vitest';
import { addTask, toggleTask, renameTask, deleteTask } from '../src/widgets/todo.js';

describe('addTask', () => {
  it('adds a task with trimmed text', () => {
    const tasks = addTask([], '  Buy milk  ');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe('Buy milk');
    expect(tasks[0].done).toBe(false);
    expect(tasks[0].id).toBeTruthy();
  });

  it('returns same array for empty text', () => {
    const tasks = [];
    expect(addTask(tasks, '')).toBe(tasks);
    expect(addTask(tasks, '   ')).toBe(tasks);
  });

  it('appends to existing tasks', () => {
    const tasks = [{ id: '1', text: 'A', done: false }];
    const result = addTask(tasks, 'B');
    expect(result).toHaveLength(2);
    expect(result[1].text).toBe('B');
  });

  it('does not mutate original array', () => {
    const tasks = [{ id: '1', text: 'A', done: false }];
    addTask(tasks, 'B');
    expect(tasks).toHaveLength(1);
  });
});

describe('toggleTask', () => {
  it('flips done state of matching task', () => {
    const tasks = [
      { id: '1', text: 'A', done: false },
      { id: '2', text: 'B', done: false },
    ];
    const result = toggleTask(tasks, '1');
    expect(result[0].done).toBe(true);
    expect(result[1].done).toBe(false);
  });

  it('toggles back to not done', () => {
    const tasks = [{ id: '1', text: 'A', done: true }];
    const result = toggleTask(tasks, '1');
    expect(result[0].done).toBe(false);
  });

  it('leaves other tasks unchanged', () => {
    const tasks = [
      { id: '1', text: 'A', done: false },
      { id: '2', text: 'B', done: true },
    ];
    const result = toggleTask(tasks, '1');
    expect(result[1].done).toBe(true);
  });

  it('no-op for unknown id', () => {
    const tasks = [{ id: '1', text: 'A', done: false }];
    const result = toggleTask(tasks, '999');
    expect(result[0].done).toBe(false);
  });
});

describe('renameTask', () => {
  it('renames matching task with trimmed text', () => {
    const tasks = [{ id: '1', text: 'Old', done: false }];
    const result = renameTask(tasks, '1', '  New  ');
    expect(result[0].text).toBe('New');
  });

  it('returns same array for empty text', () => {
    const tasks = [{ id: '1', text: 'Old', done: false }];
    expect(renameTask(tasks, '1', '')).toBe(tasks);
    expect(renameTask(tasks, '1', '   ')).toBe(tasks);
  });

  it('no-op for unknown id', () => {
    const tasks = [{ id: '1', text: 'Old', done: false }];
    const result = renameTask(tasks, '999', 'New');
    expect(result[0].text).toBe('Old');
  });
});

describe('deleteTask', () => {
  it('removes matching task', () => {
    const tasks = [
      { id: '1', text: 'A', done: false },
      { id: '2', text: 'B', done: false },
    ];
    const result = deleteTask(tasks, '1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('returns same array if task not found', () => {
    const tasks = [{ id: '1', text: 'A', done: false }];
    const result = deleteTask(tasks, '999');
    expect(result).toHaveLength(1);
  });

  it('empty array stays empty', () => {
    expect(deleteTask([], '1')).toHaveLength(0);
  });
});