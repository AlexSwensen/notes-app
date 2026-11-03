import type { Command } from '../types';

export const bulletList: Command = {
  title: 'Bulleted list',
  description: 'Simple bulleted list',
  icon: '•',
  keywords: ['ul', 'bullet', 'unordered'],
  run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
};
