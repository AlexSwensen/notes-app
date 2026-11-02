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
  onLogout: () => void;
  onClose: () => void;
  expanded: Set<string>;
  setExpanded: (fn: (s: Set<string>) => Set<string>) => void;
}


function SyncIndicator({ dirtyCount }: { dirtyCount: number }) {
  const status = useSyncExternalStore(syncEngine.subscribe, () => syncEngine.status);
  const label =
    status === 'syncing' ? 'Syncing…'
    : status === 'offline' ? `Offline${dirtyCount ? ` · ${dirtyCount} unsynced` : ''}`
    : status === 'error' ? `Sync error${syncEngine.error ? `: ${syncEngine.error}` : ''}`
    : dirtyCount ? `${dirtyCount} pending` : 'All changes synced';
  return (
    <button className={`sync-indicator ${status}`} onClick={() => syncEngine.sync()} title="Sync now">
      <span className="dot" /> {label}
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
          className={`tree-item${note.id === currentId ? ' active' : ''}${dragOver === note.id ? ' drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/note-id', note.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(note.id);
          }}
          onDragLeave={() => setDragOver((d) => (d === note.id ? null : d))}
          onDrop={(e) => onDrop(e, note.id)}
          onClick={() => onNavigate(`#/p/${note.id}`)}
        >
          <button
            className="tree-toggle"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(note.id);
            }}
          >
            <span className={`chevron${isOpen ? ' open' : ''}`}>›</span>
          </button>
          <span className="tree-icon">{note.icon || '📄'}</span>
          <span className="tree-title">{noteTitle(note)}</span>
          <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
            <button title="More" onClick={() => setMenuFor(menuFor === note.id ? null : note.id)}>⋯</button>
            <button title="Add a page inside" onClick={() => addPage(note.id)}>+</button>
          </span>
          {menuFor === note.id && (
            <div className="item-menu" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setMenuFor(null)}>
              <button onClick={() => { updateNote(note.id, { favorite: !note.favorite }); setMenuFor(null); }}>
                {note.favorite ? '☆ Remove from favorites' : '★ Add to favorites'}
              </button>
              {note.parentId && (
                <button onClick={() => { moveNote(note.id, null); setMenuFor(null); }}>⇱ Move to top level</button>
              )}
              <button className="danger" onClick={() => { trashNote(note.id); setMenuFor(null); if (note.id === currentId) onNavigate('#/'); }}>
                🗑 Move to trash
              </button>
            </div>
          )}
        </div>
        {isOpen && (
          children.length ? (
            <ul>{children.map((c) => renderItem(c, depth + 1))}</ul>
          ) : (
            <div className="tree-empty" style={{ paddingLeft: 36 + depth * 14 }}>No pages inside</div>
          )
        )}
      </li>
    );
  }

  const roots = tree.get(null) ?? [];
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="workspace">
          <span className="avatar">{props.user?.email[0]?.toUpperCase() ?? '?'}</span>
          <span className="workspace-name" title={props.user?.email}>{props.user?.email ?? 'Notes'}</span>
        </div>
        <button className="icon-btn" title="Close sidebar (Ctrl+\)" onClick={props.onClose}>«</button>
      </div>

      <nav className="sidebar-nav">
        <button onClick={props.onSearch}><span>🔍</span> Search <kbd>Ctrl K</kbd></button>
        <button onClick={() => onNavigate('#/')}><span>🏠</span> Home</button>
        <button onClick={() => addPage(null)}><span>➕</span> New page</button>
      </nav>

      <div className="sidebar-scroll">
        {favorites.length > 0 && (
          <section>
            <h3>Favorites</h3>
            <ul className="tree">
              {favorites.map((n) => (
                <li key={n.id}>
                  <div className={`tree-item${n.id === currentId ? ' active' : ''}`} style={{ paddingLeft: 8 }} onClick={() => onNavigate(`#/p/${n.id}`)}>
                    <span className="tree-toggle" />
                    <span className="tree-icon">{n.icon || '📄'}</span>
                    <span className="tree-title">{noteTitle(n)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section
          className={dragOver === 'root' ? 'drop-root' : ''}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver('root');
          }}
          onDrop={(e) => onDrop(e, null)}
        >
          <h3>
            Pages
            <button className="icon-btn small" title="New page" onClick={() => addPage(null)}>+</button>
          </h3>
          {roots.length ? (
            <ul className="tree">{roots.map((n) => renderItem(n, 0))}</ul>
          ) : (
            <div className="tree-empty" style={{ paddingLeft: 12 }}>No pages yet</div>
          )}
        </section>
      </div>

      <div className="sidebar-foot">
        <button className={props.route === 'trash' ? 'active' : ''} onClick={() => onNavigate('#/trash')}><span>🗑</span> Trash</button>
        <button onClick={props.onToggleTheme}><span>{props.theme === 'dark' ? '☀️' : '🌙'}</span> {props.theme === 'dark' ? 'Light' : 'Dark'} mode</button>
        <button onClick={props.onLogout}><span>↪</span> Log out</button>
        <SyncIndicator dirtyCount={props.dirtyCount} />
      </div>
    </aside>
  );
}
