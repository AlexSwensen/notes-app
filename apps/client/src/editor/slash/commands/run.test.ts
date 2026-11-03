import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { COMMANDS } from './index';

function run(editor: Editor, title: string) {
  const command = COMMANDS.find((c) => c.title === title);
  if (!command) throw new Error(`unknown command: ${title}`);
  const { from, to } = editor.state.selection;
  command.run(editor, { from, to });
}

describe('command run handlers (real editor)', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true })],
      content: '<h1>hello</h1>',
    });
    editor.commands.focus('end');
  });

  afterEach(() => editor.destroy());

  it('Text turns the block back into a paragraph', () => {
    run(editor, 'Text');
    expect(editor.isActive('paragraph')).toBe(true);
    expect(editor.getText().trim()).toBe('hello');
  });

  it.each([
    ['Heading 1', 1],
    ['Heading 2', 2],
    ['Heading 3', 3],
  ] as const)('%s applies a level %i heading', (title, level) => {
    run(editor, 'Text');
    run(editor, title);
    expect(editor.isActive('heading', { level })).toBe(true);
  });

  it('Bulleted list wraps the block in a bullet list', () => {
    run(editor, 'Bulleted list');
    expect(editor.isActive('bulletList')).toBe(true);
  });

  it('Numbered list wraps the block in an ordered list', () => {
    run(editor, 'Numbered list');
    expect(editor.isActive('orderedList')).toBe(true);
  });

  it('To-do list wraps the block in a task list', () => {
    run(editor, 'To-do list');
    expect(editor.isActive('taskList')).toBe(true);
  });

  it('Quote wraps the block in a blockquote', () => {
    run(editor, 'Quote');
    expect(editor.isActive('blockquote')).toBe(true);
  });

  it('Code turns the block into a code block', () => {
    run(editor, 'Code');
    expect(editor.isActive('codeBlock')).toBe(true);
  });

  it('Divider inserts a horizontal rule', () => {
    run(editor, 'Divider');
    let hasRule = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'horizontalRule') hasRule = true;
    });
    expect(hasRule).toBe(true);
  });

  it('deletes the typed "/command" text before applying the block', () => {
    editor.commands.setContent('<p>/head</p>');
    const command = COMMANDS.find((c) => c.title === 'Heading 1')!;
    command.run(editor, { from: 1, to: 6 }); // the "/head" slash query

    expect(editor.isActive('heading', { level: 1 })).toBe(true);
    expect(editor.getText()).not.toContain('/head');
  });
});
