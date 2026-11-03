import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import type { Command } from './slash/types';
import { filterCommands } from './slash/commands';
import { SlashList, type ListHandle } from './slash/SlashList';

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
