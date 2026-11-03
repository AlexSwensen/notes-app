import type { Command } from '../types';

export const todoList: Command = {
  title: 'To-do list',
  description: 'Track tasks with checkboxes',
  icon: '☑',
  keywords: ['todo', 'task', 'checkbox', 'check'],
  run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
};
