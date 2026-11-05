import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { Command } from './types';
import { SlashItem } from './SlashItem';

export interface ListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const SlashList = forwardRef<ListHandle, SuggestionProps<Command>>(
  function SlashList(props, ref) {
    const [selected, setSelected] = useState(0);
    useEffect(() => setSelected(0), [props.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        const n = props.items.length;
        if (!n) return false;
        if (event.key === 'ArrowDown') return (setSelected((s) => (s + 1) % n), true);
        if (event.key === 'ArrowUp') return (setSelected((s) => (s + n - 1) % n), true);
        if (event.key === 'Enter' || event.key === 'Tab')
          return (props.command(props.items[selected]), true);
        return false;
      },
    }));

    const menu = 'w-[300px] max-h-80 overflow-y-auto bg-elevated rounded-lg shadow-pop p-1';
    if (!props.items.length)
      return (
        <div className={menu}>
          <div className="p-2 text-muted text-sm">No results</div>
        </div>
      );
    return (
      <div className={menu} role="listbox">
        <div className="text-[11px] font-semibold text-muted px-2 pt-1.5 pb-1">Basic blocks</div>
        {props.items.map((item, i) => (
          <SlashItem
            key={item.title}
            command={item}
            selected={i === selected}
            onHover={() => setSelected(i)}
            onSelect={() => props.command(item)}
          />
        ))}
      </div>
    );
  },
);
