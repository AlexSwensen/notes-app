import Dexie, { type EntityTable } from 'dexie';
import type { JSONContent } from '@tiptap/react';

export interface Note {
  id: string;
  parentId: string | null;
  title: string;
  icon: string;
  content: JSONContent | null;
  text: string;
  favorite: boolean;
  sort: number;
  trashed: boolean;
  purged: boolean;
  createdAt: number;
  updatedAt: number;
}

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
