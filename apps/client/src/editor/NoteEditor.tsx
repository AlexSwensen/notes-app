import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import { useEffect, useRef } from 'react';
import type { LocalNote } from '../lib/db';
import { updateNote } from '../lib/notes';
import { SlashCommand } from './SlashCommand';

const SAVE_DELAY = 400;

const markButton = (active: boolean) =>
  `min-w-[30px] h-7 px-1.5 rounded text-sm ${active ? 'text-accent bg-accent/12' : 'hover:bg-hover'}`;

export function NoteEditor({
  note,
  focusSignal,
  editable = true,
}: {
  note: LocalNote;
  focusSignal: number;
  editable?: boolean;
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useRef<() => void>(() => {});
  // Serialized doc as last loaded/saved; used to ignore no-op updates (e.g. schema normalization on load).
  const baseline = useRef<string | null>(null);
  // The note.content we last applied or saved, to detect genuinely remote changes.
  const knownContent = useRef(JSON.stringify(note.content ?? null));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'heading' ? `Heading ${node.attrs.level}` : "Type '/' for commands…",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      SlashCommand,
    ],
    content: note.content ?? '',
    editable,
    editorProps: { attributes: { class: 'prose', spellcheck: 'true' } },
    onCreate: ({ editor }) => {
      baseline.current = JSON.stringify(editor.getJSON());
    },
    onUpdate: ({ editor }) => {
      const save = () => {
        saveTimer.current = undefined;
        flush.current = () => {};
        const content = editor.getJSON();
        const serialized = JSON.stringify(content);
        if (serialized === baseline.current) return;
        baseline.current = serialized;
        knownContent.current = serialized;
        updateNote(note.id, { content, text: editor.getText({ blockSeparator: '\n' }) });
      };
      flush.current = save;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(save, SAVE_DELAY);
    },
  });

  // Save pending edits when switching notes / unmounting.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      flush.current();
    },
    [],
  );

  // Apply changes that arrived from other devices.
  useEffect(() => {
    if (!editor || saveTimer.current) return;
    const incoming = JSON.stringify(note.content ?? null);
    if (incoming === knownContent.current) return;
    knownContent.current = incoming;
    if (incoming === JSON.stringify(editor.getJSON())) return;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(note.content ?? '', { emitUpdate: false });
    const max = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
    baseline.current = JSON.stringify(editor.getJSON());
  }, [editor, note.content]);

  useEffect(() => {
    if (editor && focusSignal > 0) editor.commands.focus('start');
  }, [editor, focusSignal]);

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <>
      <BubbleMenu editor={editor} className="flex bg-elevated shadow-pop rounded-md p-[3px] gap-px">
        <button
          className={markButton(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <b>B</b>
        </button>
        <button
          className={markButton(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <i>I</i>
        </button>
        <button
          className={markButton(editor.isActive('underline'))}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
        <button
          className={markButton(editor.isActive('strike'))}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
        <button
          className={markButton(editor.isActive('code'))}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          {'</>'}
        </button>
        <button
          className={markButton(editor.isActive('highlight'))}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="Highlight"
        >
          🖍
        </button>
        <button
          className={markButton(editor.isActive('link'))}
          title="Link"
          onClick={() => {
            if (editor.isActive('link')) return editor.chain().focus().unsetLink().run();
            const url = window.prompt('Link URL');
            if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
        >
          🔗
        </button>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </>
  );
}
