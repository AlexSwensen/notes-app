import { useState, useSyncExternalStore, type DragEvent } from 'react';
import type { LocalNote } from '../lib/db';
import { createNote, moveNote, trashNote, updateNote } from '../lib/notes';
import { syncEngine } from '../lib/sync';
import type { User } from '../lib/api';
import { noteTitle } from '../lib/db';

interface Props {
  tree: Map<string | null, LocalNote[]>;
  favorites: LocalNote[];
  currentId: string | null;
  route: string;
  user: User | null;
  dirtyCount: number;
  theme: string;
  onToggleTheme: () => void;
  onNavigate: (hash: string) => void;
  onSearch: () => void;
  onOpenAccount: () => void;
  onLogout: () => void;
  onClose: () => void;
  expanded: Set<string>;
  setExpanded: (fn: (s: Set<string>) => Set<string>) => void;
}

const navButton = 'flex items-center gap-2 px-2 py-[5px] rounded text-left font-medium hover:bg-hover [&>span:first-child]:w-5 [&>span:first-child]:text-center';
const treeItem = (active: boolean) =>
  `group/item relative flex items-center gap-1 h-[30px] pr-1 rounded cursor-pointer text-fg ${active ? 'bg-active font-semibold' : 'opacity-85 hover:bg-hover'}`;
const treeToggle = 'size-5 shrink-0 rounded-[3px] grid place-items-center text-faint';
const treeAction = 'size-[22px] rounded-[3px] text-muted hover:bg-active';
const menuButton = 'text-left px-2.5 py-1.5 rounded hover:bg-hover';
const sectionHeading = 'text-xs font-semibold mb-0.5 px-2 py-1 flex justify-between items-center text-faint';
const dotColor: Record<string, string> = { syncing: 'bg-accent animate-pulse', offline: 'bg-offline', error: 'bg-danger' };

function SyncIndicator({ dirtyCount }: { dirtyCount: number }) {
  const status = useSyncExternalStore(syncEngine.subscribe, () => syncEngine.status);
  const label =
    status === 'syncing' ? 'Syncing…'
    : status === 'offline' ? `Offline${dirtyCount ? ` · ${dirtyCount} unsynced` : ''}`
    : status === 'error' ? `Sync error${syncEngine.error ? `: ${syncEngine.error}` : ''}`
    : dirtyCount ? `${dirtyCount} pending` : 'All changes synced';
  return (
    <button className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-faint text-left rounded hover:bg-hover" onClick={() => syncEngine.sync()} title="Sync now">
      <span className={`size-2 shrink-0 rounded-full ${dotColor[status] ?? 'bg-ok'}`} /> {label}
    </button>
  );
}

export function Sidebar(props: Props) {
  const { tree, favorites, currentId, expanded, setExpanded, onNavigate } = props;
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function addPage(parentId: string | null) {
    const id = await createNote(parentId);
    if (parentId) setExpanded((s) => new Set(s).add(parentId));
    onNavigate(`#/p/${id}`);
  }

  function onDrop(e: DragEvent, parentId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/note-id');
    if (id) moveNote(id, parentId).then((ok) => ok && parentId && setExpanded((s) => new Set(s).add(parentId)));
  }

  function renderItem(note: LocalNote, depth: number) {
    const children = tree.get(note.id) ?? [];
    const isOpen = expanded.has(note.id);
    return (
      <li key={note.id}>
        <div
          className={`${treeItem(note.id === currentId)}${dragOver === note.id ? ' inset-ring-2 inset-ring-accent bg-accent/10' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/note-id', note.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(note.id);
          }}
          onDragLeave={() => setDragOver((d) => (d === note.id ? null : d))}
          onDrop={(e) => onDrop(e, note.id)}
          onClick={() => onNavigate(`#/p/${note.id}`)}
        >
          <button
            className={`${treeToggle} hover:bg-active`}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(note.id);
            }}
          >
            <span className={`inline-block transition-transform duration-120 text-base leading-none${isOpen ? ' rotate-90' : ''}`}>›</span>
          </button>
          <span className="w-5 text-center shrink-0">{note.icon || '📄'}</span>
          <span className="flex-1 truncate">{noteTitle(note)}</span>
          <span className="hidden gap-0.5 group-hover/item:flex max-md:flex" onClick={(e) => e.stopPropagation()}>
            <button className={treeAction} title="More" onClick={() => setMenuFor(menuFor === note.id ? null : note.id)}>⋯</button>
            <button className={treeAction} title="Add a page inside" onClick={() => addPage(note.id)}>+</button>
          </span>
          {menuFor === note.id && (
            <div
              className="absolute right-0 top-[30px] z-20 min-w-[220px] bg-elevated rounded-md shadow-pop p-1 flex flex-col font-normal"
              onClick={(e) => e.stopPropagation()}
              onMouseLeave={() => setMenuFor(null)}
            >
              <button className={menuButton} onClick={() => { updateNote(note.id, { favorite: !note.favorite }); setMenuFor(null); }}>
                {note.favorite ? '☆ Remove from favorites' : '★ Add to favorites'}
              </button>
              {note.parentId && (
                <button className={menuButton} onClick={() => { moveNote(note.id, null); setMenuFor(null); }}>⇱ Move to top level</button>
              )}
              <button className={`${menuButton} text-danger`} onClick={() => { trashNote(note.id); setMenuFor(null); if (note.id === currentId) onNavigate('#/'); }}>
                🗑 Move to trash
              </button>
            </div>
          )}
        </div>
        {isOpen && (
          children.length ? (
            <ul>{children.map((c) => renderItem(c, depth + 1))}</ul>
          ) : (
            <div className="text-[13px] text-faint py-1" style={{ paddingLeft: 36 + depth * 14 }}>No pages inside</div>
          )
        )}
      </li>
    );
  }

  const roots = tree.get(null) ?? [];
  return (
    <aside className="w-[260px] shrink-0 bg-sidebar border-r border-line flex flex-col text-sm text-muted select-none max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-60 max-md:w-[82vw] max-md:max-w-[300px] max-md:shadow-pop max-md:pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between pt-2.5 pr-2 pb-1.5 pl-3">
        <button
          className="flex items-center gap-2 min-w-0 text-fg font-medium rounded px-1 -ml-1 py-0.5 hover:bg-hover"
          title="Account settings"
          onClick={props.onOpenAccount}
        >
          <span className="size-[22px] rounded bg-accent text-white grid place-items-center text-xs shrink-0">{props.user?.email[0]?.toUpperCase() ?? '?'}</span>
          <span className="truncate">{props.user?.email ?? 'Sheafly'}</span>
        </button>
        <button className="icon-btn" title="Close sidebar (Ctrl+\)" onClick={props.onClose}>«</button>
      </div>

      <nav className="flex flex-col p-1">
        <button className={navButton} onClick={props.onSearch}><span>🔍</span> Search <kbd className="ml-auto max-md:hidden">Ctrl K</kbd></button>
        <button className={navButton} onClick={() => onNavigate('#/')}><span>🏠</span> Home</button>
        <button className={navButton} onClick={() => addPage(null)}><span>➕</span> New page</button>
      </nav>

      <div className="flex-1 overflow-y-auto py-2 px-1">
        {favorites.length > 0 && (
          <section className="mb-3.5">
            <h3 className={sectionHeading}>Favorites</h3>
            <ul>
              {favorites.map((n) => (
                <li key={n.id}>
                  <div className={treeItem(n.id === currentId)} style={{ paddingLeft: 8 }} onClick={() => onNavigate(`#/p/${n.id}`)}>
                    <span className={treeToggle} />
                    <span className="w-5 text-center shrink-0">{n.icon || '📄'}</span>
                    <span className="flex-1 truncate">{noteTitle(n)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section
          className={`mb-3.5 rounded-md${dragOver === 'root' ? ' bg-accent/8' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver('root');
          }}
          onDrop={(e) => onDrop(e, null)}
        >
          <h3 className={sectionHeading}>
            Pages
            <button className="size-5 rounded inline-flex items-center justify-center text-muted text-sm hover:bg-hover hover:text-fg" title="New page" onClick={() => addPage(null)}>+</button>
          </h3>
          {roots.length ? (
            <ul>{roots.map((n) => renderItem(n, 0))}</ul>
          ) : (
            <div className="text-[13px] text-faint py-1" style={{ paddingLeft: 12 }}>No pages yet</div>
          )}
        </section>
      </div>

      <div className="flex flex-col p-1 border-t border-line">
        <a className={`${navButton} text-accent`} href="https://github.com/AlexSwensen/sheafly#contributing" target="_blank" rel="noopener noreferrer"><span>💡</span> Contribute</a>
        <a className={navButton} href="https://github.com/AlexSwensen/sheafly/issues" target="_blank" rel="noopener noreferrer"><span>🐞</span> Report a bug</a>
        <button className={`${navButton}${props.route === 'trash' ? ' bg-hover' : ''}`} onClick={() => onNavigate('#/trash')}><span>🗑</span> Trash</button>
        <button className={navButton} onClick={props.onToggleTheme}><span>{props.theme === 'dark' ? '☀️' : '🌙'}</span> {props.theme === 'dark' ? 'Light' : 'Dark'} mode</button>
        <button className={navButton} onClick={props.onLogout}><span>↪</span> Log out</button>
        <SyncIndicator dirtyCount={props.dirtyCount} />
        <span className="px-2.5 pb-1 text-[11px] text-faint">v{__APP_VERSION__}</span>
      </div>
    </aside>
  );
}
