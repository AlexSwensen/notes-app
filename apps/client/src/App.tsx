import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalNote } from './lib/db';
import { session } from './lib/api';
import { syncEngine } from './lib/sync';
import { searchIndex } from './lib/search';
import { useHash, navigate } from './hooks/useHash';
import { useTheme } from './hooks/useTheme';
import { useNoteTree } from './hooks/useNoteTree';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { PageView } from './components/PageView';
import { SearchPalette } from './components/SearchPalette';
import { Trash } from './components/Trash';
import { Home } from './components/Home';

const NO_NOTES: LocalNote[] = [];

async function logout() {
  const unsynced = await db.notes.where('dirty').equals(1).count();
  if (unsynced && !confirm(`${unsynced} change(s) haven't synced yet and will be lost. Log out anyway?`)) return;
  syncEngine.stop();
  session.clear();
  await db.delete();
  window.location.hash = '';
  window.location.reload();
}

function Workspace() {
  const hash = useHash();
  const [theme, toggleTheme] = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const [expanded, setExpandedState] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem('notes.expanded') ?? '[]') as string[]),
  );
  const setExpanded = useCallback((fn: (s: Set<string>) => Set<string>) => {
    setExpandedState((s) => {
      const next = fn(s);
      localStorage.setItem('notes.expanded', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? NO_NOTES;
  const { byId, tree, favorites, dirtyCount } = useNoteTree(notes);

  useEffect(() => searchIndex.update(notes), [notes]);

  useEffect(() => {
    syncEngine.onUnauthorized = () => {
      session.clear();
      window.location.reload();
    };
    syncEngine.start();
    return () => syncEngine.stop();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pageMatch = hash.match(/^#\/p\/([\w-]+)/);
  const currentId = pageMatch?.[1] ?? null;
  const route = pageMatch ? 'page' : hash === '#/trash' ? 'trash' : 'home';
  const current = currentId ? byId.get(currentId) : undefined;

  // Reveal the current page in the sidebar tree.
  useEffect(() => {
    if (!current) return;
    const ancestors: string[] = [];
    for (let p = current.parentId ? byId.get(current.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
      if (ancestors.includes(p.id)) break;
      ancestors.push(p.id);
    }
    if (ancestors.some((id) => !expanded.has(id))) setExpanded((s) => new Set([...s, ...ancestors]));
  }, [current, byId, expanded, setExpanded]);

  const go = (h: string) => {
    navigate(h);
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };

  let main;
  if (route === 'trash') main = <Trash notes={notes} byId={byId} onNavigate={go} />;
  else if (route === 'page' && current && !current.purged)
    main = <PageView note={current} byId={byId} subpages={tree.get(current.id) ?? NO_NOTES} onNavigate={go} />;
  else if (route === 'page')
    main = <div className="min-h-full grid place-items-center text-muted">{current?.purged ? 'This page was permanently deleted.' : 'Page not found.'}</div>;
  else main = <Home notes={notes} onNavigate={go} onSearch={() => setSearchOpen(true)} />;

  return (
    <div className="group/app flex h-full overflow-hidden" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      {sidebarOpen && <div className="hidden max-md:block fixed inset-0 z-55 bg-[rgba(15,15,15,0.4)]" onClick={() => setSidebarOpen(false)} />}
      {sidebarOpen && (
        <Sidebar
          tree={tree}
          favorites={favorites}
          currentId={currentId}
          route={route}
          user={session.user}
          dirtyCount={dirtyCount}
          theme={theme}
          onToggleTheme={toggleTheme}
          onNavigate={go}
          onSearch={() => setSearchOpen(true)}
          onLogout={logout}
          onClose={() => setSidebarOpen(false)}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
      <main className="flex-1 min-w-0 overflow-y-auto relative">
        {!sidebarOpen && (
          <button className="icon-btn absolute top-2 left-2 z-5" title="Open sidebar (Ctrl+\)" onClick={() => setSidebarOpen(true)}>☰</button>
        )}
        {main}
      </main>
      {searchOpen && <SearchPalette notes={notes} byId={byId} onNavigate={go} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!session.token);
  return authed ? <Workspace /> : <Auth onAuthed={() => setAuthed(true)} />;
}
