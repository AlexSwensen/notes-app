import MiniSearch, { type SearchResult } from 'minisearch';
import type { Note } from './db';

interface Doc {
  id: string;
  title: string;
  text: string;
}

export interface Hit {
  id: string;
  score: number;
  terms: string[];
}

/** Incrementally maintained full-text index over all live notes. */
class SearchIndex {
  private ms = new MiniSearch<Doc>({
    fields: ['title', 'text'],
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  });
  private versions = new Map<string, number>();

  update(notes: Note[]) {
    const live = new Map<string, Note>();
    for (const n of notes) if (!n.trashed && !n.purged) live.set(n.id, n);
    for (const [id] of this.versions) {
      if (!live.has(id)) {
        this.ms.discard(id);
        this.versions.delete(id);
      }
    }
    for (const n of live.values()) {
      const v = this.versions.get(n.id);
      if (v === n.updatedAt) continue;
      const doc = { id: n.id, title: n.title, text: n.text };
      if (v === undefined) this.ms.add(doc);
      else this.ms.replace(doc);
      this.versions.set(n.id, n.updatedAt);
    }
  }

  search(query: string, limit = 50): Hit[] {
    if (!query.trim()) return [];
    return this.ms
      .search(query)
      .slice(0, limit)
      .map((r: SearchResult) => ({ id: r.id as string, score: r.score, terms: r.terms }));
  }
}

export const searchIndex = new SearchIndex();

/** Picks a short excerpt of `text` around the first matched term. */
export function snippet(text: string, terms: string[], radius = 70): string {
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : '');
}

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
