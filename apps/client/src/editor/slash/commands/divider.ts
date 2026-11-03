import type { Command } from '../types';

export const divider: Command = {
  title: 'Divider',
  description: 'Visually divide blocks',
  icon: '—',
  keywords: ['hr', 'rule', 'separator', 'line'],
  run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
};
