import type { Command } from '../types';

export const heading3: Command = {
  title: 'Heading 3',
  description: 'Small section heading',
  icon: 'H3',
  keywords: ['h3'],
  run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run(),
};
