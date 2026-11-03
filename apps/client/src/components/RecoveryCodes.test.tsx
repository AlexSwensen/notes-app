import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveryCodes } from './RecoveryCodes';
import * as download from '../lib/recoveryCodes';

const codes = ['aaaaa-11111', 'bbbbb-22222'];

describe('RecoveryCodes', () => {
  it('lists every code with a warning to keep them safe', () => {
    render(<RecoveryCodes codes={codes} onDone={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(/cannot recover your\s+account/);
    for (const c of codes) expect(screen.getByText(c)).toBeTruthy();
  });

  it('downloads the codes', async () => {
    const spy = vi.spyOn(download, 'downloadRecoveryCodes').mockImplementation(() => {});
    render(<RecoveryCodes codes={codes} onDone={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Download/ }));
    expect(spy).toHaveBeenCalledWith(codes);
  });

  it('copies the codes to the clipboard', async () => {
    const ui = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<RecoveryCodes codes={codes} onDone={() => {}} />);
    await ui.click(screen.getByRole('button', { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith('aaaaa-11111\nbbbbb-22222');
  });

  it('ignores a blocked clipboard', async () => {
    const ui = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<RecoveryCodes codes={codes} onDone={() => {}} />);
    await ui.click(screen.getByRole('button', { name: /Copy/ }));
    expect(screen.getByText(codes[0])).toBeTruthy();
  });

  it('calls onDone once the user confirms', async () => {
    const onDone = vi.fn();
    render(<RecoveryCodes codes={codes} onDone={onDone} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'I’ve saved them' }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
