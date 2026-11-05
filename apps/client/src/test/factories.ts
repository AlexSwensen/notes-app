import type { LocalNote } from '../lib/db';

let counter = 0;

export function makeNote(overrides: Partial<LocalNote> = {}): LocalNote {
  counter++;
  return {
    id: `note-${counter}`,
    parentId: null,
    title: `Note ${counter}`,
    icon: '',
    content: null,
    text: '',
    favorite: false,
    sort: counter,
    trashed: false,
    purged: false,
    createdAt: 1000 + counter,
    updatedAt: 1000 + counter,
    dirty: 0,
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
