import type { Command } from '../types';

export const code: Command = {
  title: 'Code',
  description: 'Code block',
  icon: '</>',
  keywords: ['code', 'snippet', 'pre'],
  run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
};
