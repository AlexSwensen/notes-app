import { useEffect, useState } from 'react';

/** The app uses hash routes: `#/p/<id>` (a page), `#/trash`, or anything else (home). */
export function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export const navigate = (hash: string) => {
  if (window.location.hash !== hash) window.location.hash = hash;
};
