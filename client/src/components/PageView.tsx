import { useEffect, useRef, useState } from 'react';
import type { LocalNote } from '../lib/db';
import { createNote, restoreNote, trashNote, updateNote } from '../lib/notes';
import { NoteEditor } from './NoteEditor';
import { IconPicker } from './IconPicker';
import { noteTitle } from '../lib/db';

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
      className="page-title"
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
    <div className="page">
      <header className="topbar">
        <div className="breadcrumbs">
          {crumbs.map((c) => (
            <span key={c.id}>
              <button onClick={() => onNavigate(`#/p/${c.id}`)}>{c.icon && `${c.icon} `}{noteTitle(c)}</button>
              <span className="sep">/</span>
            </span>
          ))}
          <span className="current">{note.icon && `${note.icon} `}{noteTitle(note)}</span>
        </div>
        <div className="topbar-actions">
          <span className="muted small">Edited {new Date(note.updatedAt).toLocaleString()}</span>
          <button className="icon-btn" title={note.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => updateNote(note.id, { favorite: !note.favorite })}>
            {note.favorite ? '★' : '☆'}
          </button>
          {!note.trashed && (
            <button className="icon-btn" title="Move to trash" onClick={() => { trashNote(note.id); onNavigate('#/'); }}>🗑</button>
          )}
        </div>
      </header>

      {note.trashed && (
        <div className="trash-banner">
          This page is in the trash.
          <button onClick={() => restoreNote(note.id)}>Restore</button>
        </div>
      )}

      <div className="page-body">
        <div className="page-icon-row">
          {note.icon ? (
            <button className="page-icon" onClick={() => setPicker(true)}>{note.icon}</button>
          ) : (
            <button className="add-icon" onClick={() => setPicker(true)}>☺ Add icon</button>
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

        <div className="subpages">
          {subpages.map((c) => (
            <button key={c.id} className="subpage-link" onClick={() => onNavigate(`#/p/${c.id}`)}>
              <span>{c.icon || '📄'}</span> <span className="underline">{noteTitle(c)}</span>
            </button>
          ))}
          {!note.trashed && (
            <button className="subpage-add" onClick={async () => onNavigate(`#/p/${await createNote(note.id)}`)}>+ Add a sub-page</button>
          )}
        </div>
      </div>
    </div>
  );
}
