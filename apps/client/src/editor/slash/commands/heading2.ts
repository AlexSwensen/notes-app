import type { Command } from '../types';

export const heading2: Command = {
  title: 'Heading 2',
  description: 'Medium section heading',
  icon: 'H2',
  keywords: ['h2', 'subtitle'],
  run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run(),
};
