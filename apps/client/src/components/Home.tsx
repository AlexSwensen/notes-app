import type { LocalNote } from '../lib/db';
import { createNote } from '../lib/notes';
import { noteTitle } from '../lib/db';

export function Home({ notes, onNavigate, onSearch }: { notes: LocalNote[]; onNavigate: (h: string) => void; onSearch: () => void }) {
  const live = notes.filter((n) => !n.trashed && !n.purged);
  const recent = [...live].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <header className="topbar"><div className="breadcrumbs"><span className="current">🏠 Home</span></div></header>
      <div className="page-body">
        <h1 className="page-heading">{greeting}</h1>
        <button className="home-search" onClick={onSearch}>🔍 Search {live.length} pages… <kbd>Ctrl K</kbd></button>
        <h3 className="section-title">Recently edited</h3>
        <div className="cards">
          <button className="card card-new" onClick={async () => onNavigate(`#/p/${await createNote(null)}`)}>
            <span className="card-icon">＋</span>
            <span className="card-title">New page</span>
          </button>
          {recent.map((n) => (
            <button key={n.id} className="card" onClick={() => onNavigate(`#/p/${n.id}`)}>
              <span className="card-icon">{n.icon || '📄'}</span>
              <span className="card-title">{noteTitle(n)}</span>
              <span className="card-preview">{n.text.slice(0, 120)}</span>
              <span className="card-date">{new Date(n.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
