import type { Command } from '../types';

export const heading1: Command = {
  title: 'Heading 1',
  description: 'Big section heading',
  icon: 'H1',
  keywords: ['h1', 'title'],
  run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run(),
};
