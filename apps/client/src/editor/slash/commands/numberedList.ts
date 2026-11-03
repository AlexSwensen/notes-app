import type { Command } from '../types';

export const numberedList: Command = {
  title: 'Numbered list',
  description: 'List with numbering',
  icon: '1.',
  keywords: ['ol', 'ordered', 'number'],
  run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
};
