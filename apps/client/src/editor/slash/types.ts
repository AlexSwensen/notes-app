import type { Editor, Range } from '@tiptap/core';

export interface Command {
  title: string;
  description: string;
  icon: string;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
}
