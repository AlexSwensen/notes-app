import { useEffect, useRef, useState } from 'react';
import type { LocalNote } from '../lib/db';
import { createNote, restoreNote, trashNote, updateNote } from '../lib/notes';
import { NoteEditor } from '../editor/NoteEditor';
import { IconPicker } from './IconPicker';
import { noteTitle } from '../lib/db';
import { breadcrumbs, crumbCurrent, pageBody, topbar } from './styles';

interface Props {
  note: LocalNote;
  byId: Map<string, LocalNote>;
  subpages: LocalNote[];
  onNavigate: (hash: string) => void;
}

function TitleInput({ note, onEnter }: { note: LocalNote; onEnter: () => void }) {
  const [value, setValue] = useState(note.title);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(note.title);
  }, [note.title]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (!note.title && !note.text) ref.current?.focus();
    // Only on mount for a fresh page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={ref}
      className="block w-full resize-none border-0 outline-none bg-transparent text-[40px] font-bold leading-[1.2] p-0 mt-2 mb-3 overflow-hidden placeholder:text-faint max-md:text-[32px]"
      rows={1}
      placeholder="Untitled"
      value={value}
      readOnly={note.trashed}
      onChange={(e) => {
        const title = e.target.value.replace(/\n/g, '');
        setValue(title);
        updateNote(note.id, { title });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === value.length)) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

export function PageView({ note, byId, subpages, onNavigate }: Props) {
  const [picker, setPicker] = useState(false);
  const [focusEditor, setFocusEditor] = useState(0);

  const crumbs: LocalNote[] = [];
  for (let p = note.parentId ? byId.get(note.parentId) : undefined; p && crumbs.length < 20; p = p.parentId ? byId.get(p.parentId) : undefined) {
    crumbs.unshift(p);
  }

  return (
    <div className="min-h-full">
      <header className={topbar}>
        <div className={breadcrumbs}>
          {crumbs.map((c) => (
            <span key={c.id}>
              <button className="px-1.5 py-0.5 rounded max-w-40 truncate hover:bg-hover" onClick={() => onNavigate(`#/p/${c.id}`)}>{c.icon && `${c.icon} `}{noteTitle(c)}</button>
              <span className="text-faint mx-0.5">/</span>
            </span>
          ))}
          <span className={crumbCurrent}>{note.icon && `${note.icon} `}{noteTitle(note)}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-muted text-xs max-md:hidden">Edited {new Date(note.updatedAt).toLocaleString()}</span>
          <button className="icon-btn" title={note.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => updateNote(note.id, { favorite: !note.favorite })}>
            {note.favorite ? '★' : '☆'}
          </button>
          {!note.trashed && (
            <button className="icon-btn" title="Move to trash" onClick={() => { trashNote(note.id); onNavigate('#/'); }}>🗑</button>
          )}
        </div>
      </header>

      {note.trashed && (
        <div className="bg-danger text-white text-center p-2 text-sm">
          This page is in the trash.
          <button className="ml-3 border border-white/60 rounded px-2.5 py-0.5" onClick={() => restoreNote(note.id)}>Restore</button>
        </div>
      )}

      <div className={`group/body ${pageBody}`}>
        <div className="relative min-h-8">
          {note.icon ? (
            <button className="text-[72px] leading-none rounded-md p-1 -ml-1 hover:bg-hover" onClick={() => setPicker(true)}>{note.icon}</button>
          ) : (
            <button
              className="text-sm text-faint px-2 py-1 rounded -ml-2 opacity-0 transition-opacity duration-150 group-hover/body:opacity-100 focus:opacity-100 hover:bg-hover"
              onClick={() => setPicker(true)}
            >
              ☺ Add icon
            </button>
          )}
          {picker && (
            <IconPicker
              onClose={() => setPicker(false)}
              onPick={(icon) => {
                updateNote(note.id, { icon });
                setPicker(false);
              }}
            />
          )}
        </div>
        <TitleInput note={note} onEnter={() => setFocusEditor((n) => n + 1)} />
        <NoteEditor key={note.id} note={note} focusSignal={focusEditor} editable={!note.trashed} />

        <div className="mt-6 flex flex-col items-start gap-0.5">
          {subpages.map((c) => (
            <button key={c.id} className="px-1.5 py-1 rounded -ml-1.5 hover:bg-hover" onClick={() => onNavigate(`#/p/${c.id}`)}>
              <span>{c.icon || '📄'}</span> <span className="underline decoration-faint underline-offset-3">{noteTitle(c)}</span>
            </button>
          ))}
          {!note.trashed && (
            <button className="text-faint text-sm px-1.5 py-1 -ml-1.5 rounded hover:bg-hover hover:text-muted" onClick={async () => onNavigate(`#/p/${await createNote(note.id)}`)}>+ Add a sub-page</button>
          )}
        </div>
      </div>
    </div>
  );
}
