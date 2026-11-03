import type { Command } from '../types';
import { text } from './text';
import { heading1 } from './heading1';
import { heading2 } from './heading2';
import { heading3 } from './heading3';
import { bulletList } from './bulletList';
import { numberedList } from './numberedList';
import { todoList } from './todoList';
import { quote } from './quote';
import { code } from './code';
import { divider } from './divider';

export const COMMANDS: Command[] = [
  text,
  heading1,
  heading2,
  heading3,
  bulletList,
  numberedList,
  todoList,
  quote,
  code,
  divider,
];

export function filterCommands(query: string) {
  const q = query.toLowerCase();
  return COMMANDS.filter((c) => c.title.toLowerCase().includes(q) || c.keywords.some((k) => k.startsWith(q)));
}
