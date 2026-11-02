import Dexie, { type EntityTable } from 'dexie';
import type { JSONContent } from '@tiptap/react';
import type { Note as SharedNote } from '@sheafly/shared';

/** A note whose content is a TipTap editor document. */
export type Note = SharedNote<JSONContent | null>;

/** Local record: `dirty` = 1 when it has changes not yet pushed to the server. */
export interface LocalNote extends Note {
  dirty: 0 | 1;
}

interface Meta {
  key: string;
  value: unknown;
}

export const db = new Dexie('notes-app') as Dexie & {
  notes: EntityTable<LocalNote, 'id'>;
  meta: EntityTable<Meta, 'key'>;
};

db.version(1).stores({
  notes: 'id, parentId, dirty, updatedAt',
  meta: 'key',
});

/** Deletes the local database. The session is kept, so notes re-download on the next sync. */
export async function resetLocalData() {
  db.close();
  await Dexie.delete(db.name);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

export const noteTitle = (n: Pick<Note, 'title'>) => n.title.trim() || 'Untitled';

export function stripLocal(n: LocalNote): Note {
  const { dirty: _dirty, ...note } = n;
  return note;
}
