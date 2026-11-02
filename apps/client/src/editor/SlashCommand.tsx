import { Extension, type Editor, type Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

interface Command {
  title: string;
  description: string;
  icon: string;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
}

const COMMANDS: Command[] = [
  { title: 'Text', description: 'Plain paragraph', icon: '¶', keywords: ['paragraph', 'p'], run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: 'Heading 1', description: 'Big section heading', icon: 'H1', keywords: ['h1', 'title'], run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: 'Heading 2', description: 'Medium section heading', icon: 'H2', keywords: ['h2', 'subtitle'], run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: 'Heading 3', description: 'Small section heading', icon: 'H3', keywords: ['h3'], run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { title: 'Bulleted list', description: 'Simple bulleted list', icon: '•', keywords: ['ul', 'bullet', 'unordered'], run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: 'Numbered list', description: 'List with numbering', icon: '1.', keywords: ['ol', 'ordered', 'number'], run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: 'To-do list', description: 'Track tasks with checkboxes', icon: '☑', keywords: ['todo', 'task', 'checkbox', 'check'], run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: 'Quote', description: 'Capture a quote', icon: '❝', keywords: ['blockquote', 'citation'], run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: 'Code', description: 'Code block', icon: '</>', keywords: ['code', 'snippet', 'pre'], run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: 'Divider', description: 'Visually divide blocks', icon: '—', keywords: ['hr', 'rule', 'separator', 'line'], run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

function filterCommands(query: string) {
  const q = query.toLowerCase();
  return COMMANDS.filter((c) => c.title.toLowerCase().includes(q) || c.keywords.some((k) => k.startsWith(q)));
}

interface ListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const SlashList = forwardRef<ListHandle, SuggestionProps<Command>>(function SlashList(props, ref) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = props.items.length;
      if (!n) return false;
      if (event.key === 'ArrowDown') return setSelected((s) => (s + 1) % n), true;
      if (event.key === 'ArrowUp') return setSelected((s) => (s + n - 1) % n), true;
      if (event.key === 'Enter' || event.key === 'Tab') return props.command(props.items[selected]), true;
      return false;
    },
  }));

  const menu = 'w-[300px] max-h-80 overflow-y-auto bg-elevated rounded-lg shadow-pop p-1';
  if (!props.items.length) return <div className={menu}><div className="p-2 text-muted text-sm">No results</div></div>;
  return (
    <div className={menu} role="listbox">
      <div className="text-[11px] font-semibold text-muted px-2 pt-1.5 pb-1">Basic blocks</div>
      {props.items.map((item, i) => (
        <button
          key={item.title}
          role="option"
          aria-selected={i === selected}
          className="flex gap-2.5 items-center w-full text-left px-2 py-1 rounded aria-selected:bg-hover"
          onMouseEnter={() => setSelected(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            props.command(item);
          }}
          ref={(el) => {
            if (i === selected) el?.scrollIntoView({ block: 'nearest' });
          }}
        >
          <span className="size-10 border border-line rounded-md grid place-items-center bg-bg text-[15px] font-semibold shrink-0">{item.icon}</span>
          <span>
            <span className="block text-sm">{item.title}</span>
            <span className="block text-xs text-muted">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

function position(el: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  const menuHeight = Math.min(el.offsetHeight || 320, 320);
  const below = rect.bottom + 6;
  const top = below + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 6) : below;
  el.style.top = `${top}px`;
  el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<Command>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterCommands(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<ListHandle, SuggestionProps<Command>> | null = null;
          let el: HTMLDivElement | null = null;
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashList, { props, editor: props.editor });
              el = document.createElement('div');
              el.className = 'fixed z-50';
              el.appendChild(renderer.element);
              document.body.appendChild(el);
              position(el, props.clientRect?.());
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
              if (el) position(el, props.clientRect?.());
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                el?.remove();
                return true;
              }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              el?.remove();
              renderer?.destroy();
              el = null;
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
