import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalNote } from '../lib/db';
import { searchIndex, snippet } from '../lib/search';
import { createNote } from '../lib/notes';
import { Highlight } from './Highlight';
import { noteTitle } from '../lib/db';

const paletteItem = 'flex gap-2.5 w-full text-left px-2.5 py-2 rounded-md items-start aria-selected:bg-hover';

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
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
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
    <div className="fixed inset-0 z-100 bg-[rgba(15,15,15,0.45)] flex justify-center items-start pt-[12vh] px-4 pb-4" onMouseDown={onClose}>
      <div className="w-full max-w-[640px] bg-elevated rounded-xl shadow-pop overflow-hidden flex flex-col max-h-[70vh]" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
          <span>🔍</span>
          <input
            className="flex-1 border-0 outline-none bg-transparent text-[17px]"
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
        <div className="overflow-y-auto p-1.5" ref={listRef} role="listbox">
          {!query.trim() && results.length > 0 && <div className="text-xs font-semibold text-muted px-2.5 py-1.5">Recent</div>}
          {query.trim() && results.length === 0 && <div className="p-5 text-center text-muted">No results for “{query}”</div>}
          {results.map(({ note, terms }, i) => (
            <button
              key={note.id}
              role="option"
              aria-selected={i === selected}
              className={paletteItem}
              onMouseEnter={() => setSelected(i)}
              onClick={() => open(note.id)}
            >
              <span className="w-[22px] text-center shrink-0">{note.icon || '📄'}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">
                  <Highlight text={noteTitle(note)} terms={terms} />
                  {path(note) && <span className="font-normal text-faint text-[13px]"> — {path(note)}</span>}
                </span>
                {terms.length > 0 && note.text && (
                  <span className="text-[13px] text-muted mt-0.5 line-clamp-2"><Highlight text={snippet(note.text, terms)} terms={terms} /></span>
                )}
              </span>
            </button>
          ))}
          {query.trim() && (
            <button
              role="option"
              aria-selected={selected === results.length}
              className={paletteItem}
              onMouseEnter={() => setSelected(results.length)}
              onClick={createFromQuery}
            >
              <span className="w-[22px] text-center shrink-0">➕</span>
              <span className="min-w-0 flex-1"><span className="block font-medium truncate">New page “{query.trim()}”</span></span>
            </button>
          )}
        </div>
        <div className="flex gap-4 px-4 py-2 border-t border-line text-xs text-faint">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span className="ml-auto">{notes.filter((n) => !n.trashed && !n.purged).length} pages indexed</span>
        </div>
      </div>
    </div>
  );
}
