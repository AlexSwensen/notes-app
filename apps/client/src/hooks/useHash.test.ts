import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { navigate, useHash } from './useHash';

describe('useHash', () => {
  it('returns the current hash and follows hashchange events', () => {
    window.location.hash = '#/trash';
    const { result } = renderHook(() => useHash());
    expect(result.current).toBe('#/trash');

    act(() => {
      window.location.hash = '#/p/abc';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('#/p/abc');
  });

  it('stops listening after unmount', () => {
    const { result, unmount } = renderHook(() => useHash());
    unmount();
    window.location.hash = '#/p/later';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(result.current).toBe('');
  });
});

describe('navigate', () => {
  it('updates the hash', () => {
    navigate('#/p/xyz');
    expect(window.location.hash).toBe('#/p/xyz');
  });

  it('does not fire hashchange when already on that hash', () => {
    navigate('#/trash');
    let fired = 0;
    const on = () => fired++;
    window.addEventListener('hashchange', on);
    navigate('#/trash');
    window.removeEventListener('hashchange', on);
    expect(fired).toBe(0);
  });
});
