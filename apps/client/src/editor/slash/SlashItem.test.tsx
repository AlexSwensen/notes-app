import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SlashItem } from './SlashItem';
import type { Command } from './types';

const command: Command = {
  title: 'Heading 1',
  description: 'Big section heading',
  icon: 'H1',
  keywords: ['h1', 'title'],
  run: () => {},
};

function setup(overrides: Partial<Parameters<typeof SlashItem>[0]> = {}) {
  const onHover = vi.fn();
  const onSelect = vi.fn();
  render(<SlashItem command={command} selected={false} onHover={onHover} onSelect={onSelect} {...overrides} />);
  return { onHover, onSelect };
}

describe('SlashItem', () => {
  it('renders the command icon, title and description', () => {
    setup();
    expect(screen.getByRole('option').textContent).toBe('H1Heading 1Big section heading');
  });

  it('reflects the selected state via aria-selected', () => {
    const { rerender } = render(
      <SlashItem command={command} selected onHover={() => {}} onSelect={() => {}} />,
    );
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('true');

    rerender(<SlashItem command={command} selected={false} onHover={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('false');
  });

  it('calls onHover when the pointer enters', () => {
    const { onHover } = setup();
    fireEvent.mouseEnter(screen.getByRole('option'));
    expect(onHover).toHaveBeenCalledOnce();
  });

  it('selects on mouse down and prevents default so the editor keeps focus', () => {
    const { onSelect } = setup();
    const prevented = !fireEvent.mouseDown(screen.getByRole('option'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(prevented).toBe(true);
  });
});
