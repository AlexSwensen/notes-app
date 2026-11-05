import type { LocalNote } from '../lib/db';
import { purgeNote, restoreNote } from '../lib/notes';
import { noteTitle } from '../lib/db';
import { breadcrumbs, crumbCurrent, pageBody, pageHeading, topbar } from './styles';

export function Trash({
  notes,
  byId,
  onNavigate,
}: {
  notes: LocalNote[];
  byId: Map<string, LocalNote>;
  onNavigate: (h: string) => void;
}) {
  // Show only the top of each trashed subtree; restoring/deleting cascades.
  const items = notes
    .filter(
      (n) =>
        n.trashed &&
        !n.purged &&
        !(n.parentId && byId.get(n.parentId)?.trashed && !byId.get(n.parentId)?.purged),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="min-h-full">
      <header className={topbar}>
        <div className={breadcrumbs}>
          <span className={crumbCurrent}>🗑 Trash</span>
        </div>
      </header>
      <div className={pageBody}>
        <h1 className={pageHeading}>Trash</h1>
        {items.length === 0 ? (
          <p className="text-muted">Trash is empty.</p>
        ) : (
          <>
            <div className="flex justify-between items-center mb-3">
              <span className="text-muted">
                {items.length} page{items.length === 1 ? '' : 's'}
              </span>
              <button
                className="danger-btn"
                onClick={() => {
                  if (confirm('Permanently delete everything in the trash? This cannot be undone.'))
                    items.forEach((n) => purgeNote(n.id));
                }}
              >
                Empty trash
              </button>
            </div>
            <ul>
              {items.map((n) => (
                <li key={n.id} className="flex items-center gap-2 py-1.5 border-b border-line">
                  <button
                    className="flex-1 text-left px-1.5 py-1 rounded hover:bg-hover"
                    onClick={() => onNavigate(`#/p/${n.id}`)}
                  >
                    <span>{n.icon || '📄'}</span> {noteTitle(n)}
                    <span className="text-muted text-xs">
                      {' '}
                      · deleted {new Date(n.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    className="text-[13px] px-2.5 py-[3px] border border-line rounded hover:bg-hover"
                    onClick={() => restoreNote(n.id)}
                  >
                    Restore
                  </button>
                  <button
                    className="danger-btn"
                    onClick={() =>
                      confirm(`Permanently delete "${noteTitle(n)}"?`) && purgeNote(n.id)
                    }
                  >
                    Delete forever
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
