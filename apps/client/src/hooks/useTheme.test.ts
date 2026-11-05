import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';

const prefersDark = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches })),
  );

describe('useTheme', () => {
  it('follows the system preference when nothing is saved', () => {
    prefersDark(true);
    const { result } = renderHook(() => useTheme());

    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('notes.theme')).toBe('dark');
  });

  it('prefers the saved theme over the system preference', () => {
    prefersDark(true);
    localStorage.setItem('notes.theme', 'light');
    const { result } = renderHook(() => useTheme());

    expect(result.current[0]).toBe('light');
  });

  it('toggles between light and dark and remembers the choice', () => {
    prefersDark(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('light');

    act(() => result.current[1]());
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('notes.theme')).toBe('dark');

    act(() => result.current[1]());
    expect(result.current[0]).toBe('light');
  });
});
