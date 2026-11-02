import { useMemo } from 'react';
import type { LocalNote } from '../lib/db';

/**
 * Turns the flat list of notes into the lookups the UI needs:
 * - `byId`: every note (including trashed) by id
 * - `tree`: live notes grouped by parent id (`null` = top level), sorted
 * - `favorites`: live favorite notes, by title
 * - `dirtyCount`: notes with changes not yet synced
 */
export function useNoteTree(notes: LocalNote[]) {
  return useMemo(() => {
    const byId = new Map<string, LocalNote>();
    const tree = new Map<string | null, LocalNote[]>();
    let dirtyCount = 0;
    for (const n of notes) {
      byId.set(n.id, n);
      if (n.dirty) dirtyCount++;
    }
    for (const n of notes) {
      if (n.trashed || n.purged) continue;
      // Orphans (parent missing locally) are shown at the top level.
      const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
      if (!tree.has(key)) tree.set(key, []);
      tree.get(key)!.push(n);
    }
    for (const list of tree.values()) list.sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt);
    const favorites = notes.filter((n) => n.favorite && !n.trashed && !n.purged).sort((a, b) => a.title.localeCompare(b.title));
    return { byId, tree, favorites, dirtyCount };
  }, [notes]);
}
