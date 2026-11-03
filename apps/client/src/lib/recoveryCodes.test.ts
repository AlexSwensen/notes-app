import { describe, expect, it, vi } from 'vitest';
import { downloadRecoveryCodes, recoveryCodesFile } from './recoveryCodes';

describe('recoveryCodesFile', () => {
  it('includes a warning and one code per line', () => {
    const text = recoveryCodesFile(['aaaaa-11111', 'bbbbb-22222']);
    expect(text).toMatch(/cannot recover your account/);
    expect(text.trimEnd().split('\n').slice(-2)).toEqual(['aaaaa-11111', 'bbbbb-22222']);
  });
});

describe('downloadRecoveryCodes', () => {
  it('downloads a text file and releases the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:codes');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadRecoveryCodes(['aaaaa-11111']);

    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('sheafly-recovery-codes.txt');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:codes');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
