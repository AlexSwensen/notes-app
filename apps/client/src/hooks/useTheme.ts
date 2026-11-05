import { useEffect, useState } from 'react';

/** Light/dark theme, remembered in localStorage and applied as `<html data-theme>`. */
export function useTheme() {
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem('notes.theme') ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('notes.theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}
