import type { LocalNote } from '../lib/db';
import { createNote } from '../lib/notes';
import { noteTitle } from '../lib/db';
import { breadcrumbs, crumbCurrent, pageBody, pageHeading, topbar } from './styles';

const card = 'flex flex-col gap-1.5 text-left p-3.5 h-[150px] rounded-[10px] border border-line overflow-hidden transition-[transform,box-shadow] duration-100 hover:shadow-pop hover:-translate-y-px';

export function Home({ notes, onNavigate, onSearch }: { notes: LocalNote[]; onNavigate: (h: string) => void; onSearch: () => void }) {
  const live = notes.filter((n) => !n.trashed && !n.purged);
  const recent = [...live].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-full">
      <header className={topbar}><div className={breadcrumbs}><span className={crumbCurrent}>🏠 Home</span></div></header>
      <div className={pageBody}>
        <h1 className={pageHeading}>{greeting}</h1>
        <button className="w-full text-left px-3.5 py-2.5 border border-line rounded-lg text-muted flex items-center gap-2 mb-8 hover:bg-hover" onClick={onSearch}>
          🔍 Search {live.length} pages… <kbd className="ml-auto max-md:hidden">Ctrl K</kbd>
        </button>
        <h3 className="text-[13px] text-muted font-semibold mb-3">Recently edited</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          <button className={`${card} items-center justify-center text-muted border-dashed`} onClick={async () => onNavigate(`#/p/${await createNote(null)}`)}>
            <span className="text-[26px]">＋</span>
            <span className="font-semibold truncate">New page</span>
          </button>
          {recent.map((n) => (
            <button key={n.id} className={`${card} bg-sidebar`} onClick={() => onNavigate(`#/p/${n.id}`)}>
              <span className="text-[26px]">{n.icon || '📄'}</span>
              <span className="font-semibold truncate">{noteTitle(n)}</span>
              <span className="text-xs text-muted flex-1 overflow-hidden">{n.text.slice(0, 120)}</span>
              <span className="text-[11px] text-faint">{new Date(n.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
