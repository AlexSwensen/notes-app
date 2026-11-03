import type { Command } from '../types';

export const quote: Command = {
  title: 'Quote',
  description: 'Capture a quote',
  icon: '❝',
  keywords: ['blockquote', 'citation'],
  run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
};
