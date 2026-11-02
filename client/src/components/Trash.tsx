import type { LocalNote } from '../lib/db';
import { purgeNote, restoreNote } from '../lib/notes';
import { noteTitle } from '../lib/db';

export function Trash({ notes, byId, onNavigate }: { notes: LocalNote[]; byId: Map<string, LocalNote>; onNavigate: (h: string) => void }) {
  // Show only the top of each trashed subtree; restoring/deleting cascades.
  const items = notes
    .filter((n) => n.trashed && !n.purged && !(n.parentId && byId.get(n.parentId)?.trashed && !byId.get(n.parentId)?.purged))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="page">
      <header className="topbar"><div className="breadcrumbs"><span className="current">🗑 Trash</span></div></header>
      <div className="page-body">
        <h1 className="page-heading">Trash</h1>
        {items.length === 0 ? (
          <p className="muted">Trash is empty.</p>
        ) : (
          <>
            <div className="trash-toolbar">
              <span className="muted">{items.length} page{items.length === 1 ? '' : 's'}</span>
              <button
                className="danger-btn"
                onClick={() => {
                  if (confirm('Permanently delete everything in the trash? This cannot be undone.')) items.forEach((n) => purgeNote(n.id));
                }}
              >
                Empty trash
              </button>
            </div>
            <ul className="trash-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button className="trash-open" onClick={() => onNavigate(`#/p/${n.id}`)}>
                    <span>{n.icon || '📄'}</span> {noteTitle(n)}
                    <span className="muted small"> · deleted {new Date(n.updatedAt).toLocaleDateString()}</span>
                  </button>
                  <button onClick={() => restoreNote(n.id)}>Restore</button>
                  <button className="danger-btn" onClick={() => confirm(`Permanently delete "${noteTitle(n)}"?`) && purgeNote(n.id)}>Delete forever</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
