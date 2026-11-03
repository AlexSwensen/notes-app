import type { Command } from '../types';

export const text: Command = {
  title: 'Text',
  description: 'Plain paragraph',
  icon: '¶',
  keywords: ['paragraph', 'p'],
  run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run(),
};
