import type { Command } from './types';

interface SlashItemProps {
  command: Command;
  selected: boolean;
  onHover: () => void;
  onSelect: () => void;
}

export function SlashItem({ command, selected, onHover, onSelect }: SlashItemProps) {
  return (
    <button
      role="option"
      aria-selected={selected}
      className="flex gap-2.5 items-center w-full text-left px-2 py-1 rounded aria-selected:bg-hover"
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      ref={(el) => {
        if (selected) el?.scrollIntoView({ block: 'nearest' });
      }}
    >
      <span className="size-10 border border-line rounded-md grid place-items-center bg-bg text-[15px] font-semibold shrink-0">
        {command.icon}
      </span>
      <span>
        <span className="block text-sm">{command.title}</span>
        <span className="block text-xs text-muted">{command.description}</span>
      </span>
    </button>
  );
}
