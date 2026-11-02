import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalNote } from '../lib/db';
import { searchIndex, snippet } from '../lib/search';
import { createNote } from '../lib/notes';
import { Highlight } from './Highlight';
import { noteTitle } from '../lib/db';

interface Props {
  notes: LocalNote[];
  byId: Map<string, LocalNote>;
  onNavigate: (hash: string) => void;
  onClose: () => void;
}

export function SearchPalette({ notes, byId, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) {
      return notes
        .filter((n) => !n.trashed && !n.purged)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8)
        .map((n) => ({ note: n, terms: [] as string[] }));
    }
    return searchIndex
      .search(query)
      .map((h) => ({ note: byId.get(h.id)!, terms: h.terms }))
      .filter((r) => r.note);
  }, [query, notes, byId]);

  useEffect(() => {
    listRef.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const open = (id: string) => {
    onNavigate(`#/p/${id}`);
    onClose();
  };

  const createFromQuery = async () => {
    const id = await createNote(null, { title: query.trim() });
    open(id);
  };

  const path = (n: LocalNote) => {
    const parts: string[] = [];
    for (let p = n.parentId ? byId.get(n.parentId) : undefined; p && parts.length < 5; p = p.parentId ? byId.get(p.parentId) : undefined) {
      parts.unshift(noteTitle(p));
    }
    return parts.join(' / ');
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="palette-input">
          <span>🔍</span>
          <input
            autoFocus
            placeholder="Search your notes…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              const count = results.length + (query.trim() ? 1 : 0);
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => (s + 1) % Math.max(count, 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => (s - 1 + count) % Math.max(count, 1)); }
              else if (e.key === 'Enter') {
                e.preventDefault();
                if (selected < results.length) open(results[selected].note.id);
                else if (query.trim()) createFromQuery();
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-results" ref={listRef}>
          {!query.trim() && results.length > 0 && <div className="palette-heading">Recent</div>}
          {query.trim() && results.length === 0 && <div className="palette-empty">No results for “{query}”</div>}
          {results.map(({ note, terms }, i) => (
            <button
              key={note.id}
              className={`palette-item${i === selected ? ' selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => open(note.id)}
            >
              <span className="palette-icon">{note.icon || '📄'}</span>
              <span className="palette-text">
                <span className="palette-title">
                  <Highlight text={noteTitle(note)} terms={terms} />
                  {path(note) && <span className="palette-path"> — {path(note)}</span>}
                </span>
                {terms.length > 0 && note.text && (
                  <span className="palette-snippet"><Highlight text={snippet(note.text, terms)} terms={terms} /></span>
                )}
              </span>
            </button>
          ))}
          {query.trim() && (
            <button
              className={`palette-item${selected === results.length ? ' selected' : ''}`}
              onMouseEnter={() => setSelected(results.length)}
              onClick={createFromQuery}
            >
              <span className="palette-icon">➕</span>
              <span className="palette-text"><span className="palette-title">New page “{query.trim()}”</span></span>
            </button>
          )}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span>{notes.filter((n) => !n.trashed && !n.purged).length} pages indexed</span>
        </div>
      </div>
    </div>
  );
}
