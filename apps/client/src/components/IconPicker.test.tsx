import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconPicker } from './IconPicker';

describe('IconPicker', () => {
  it('picks an emoji', async () => {
    const onPick = vi.fn();
    render(<IconPicker onPick={onPick} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: '🚀' }));
    expect(onPick).toHaveBeenCalledWith('🚀');
  });

  it('removes the icon', async () => {
    const onPick = vi.fn();
    render(<IconPicker onPick={onPick} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onPick).toHaveBeenCalledWith('');
  });

  it('closes on Escape and on outside clicks only', () => {
    const onClose = vi.fn();
    render(
      <div>
        <button>outside</button>
        <IconPicker onPick={() => {}} onClose={onClose} />
      </div>,
    );

    fireEvent.mouseDown(screen.getByText('Pick an icon'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('stops listening after unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(<IconPicker onPick={() => {}} onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
