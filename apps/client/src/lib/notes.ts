import { db, type LocalNote } from './db';
import { syncEngine } from './sync';

function nextTimestamp(prev?: number) {
  // Monotonic per note so last-writer-wins always favours the newest local edit.
  return Math.max(Date.now(), (prev ?? 0) + 1);
}

function siblingsOf(parentId: string | null) {
  return parentId
    ? db.notes.where('parentId').equals(parentId).toArray()
    : db.notes.filter((n) => n.parentId === null).toArray();
}

export async function createNote(parentId: string | null = null, init: Partial<LocalNote> = {}): Promise<string> {
  const siblings = await siblingsOf(parentId);
  const now = Date.now();
  const note: LocalNote = {
    id: crypto.randomUUID(),
    parentId,
    title: '',
    icon: '',
    content: null,
    text: '',
    favorite: false,
    sort: siblings.reduce((m, n) => Math.max(m, n.sort), 0) + 1,
    trashed: false,
    purged: false,
    createdAt: now,
    updatedAt: now,
    dirty: 1,
    ...init,
  };
  await db.notes.add(note);
  syncEngine.schedule();
  return note.id;
}

export async function updateNote(id: string, patch: Partial<Omit<LocalNote, 'id' | 'dirty'>>) {
  await db.transaction('rw', db.notes, async () => {
    const cur = await db.notes.get(id);
    if (!cur) return;
    await db.notes.update(id, { ...patch, updatedAt: nextTimestamp(cur.updatedAt), dirty: 1 });
  });
  syncEngine.schedule();
}

async function descendants(id: string): Promise<LocalNote[]> {
  const all = await db.notes.toArray();
  const byParent = new Map<string, LocalNote[]>();
  for (const n of all) {
    if (!n.parentId) continue;
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId)!.push(n);
  }
  const out: LocalNote[] = [];
  const stack = [id];
  while (stack.length) {
    for (const child of byParent.get(stack.pop()!) ?? []) {
      out.push(child);
      stack.push(child.id);
    }
  }
  return out;
}

async function setTrashed(id: string, trashed: boolean) {
  const ids = [id, ...(await descendants(id)).map((n) => n.id)];
  await db.transaction('rw', db.notes, async () => {
    for (const nid of ids) {
      const cur = await db.notes.get(nid);
      if (cur && !cur.purged) await db.notes.update(nid, { trashed, updatedAt: nextTimestamp(cur.updatedAt), dirty: 1 });
    }
  });
  syncEngine.schedule();
}

export const trashNote = (id: string) => setTrashed(id, true);

export async function restoreNote(id: string) {
  const note = await db.notes.get(id);
  // If the parent is still in the trash, restore to the top level.
  if (note?.parentId) {
    const parent = await db.notes.get(note.parentId);
    if (!parent || parent.trashed) await updateNote(id, { parentId: null });
  }
  await setTrashed(id, false);
}

export async function purgeNote(id: string) {
  const ids = [id, ...(await descendants(id)).map((n) => n.id)];
  await db.transaction('rw', db.notes, async () => {
    for (const nid of ids) {
      const cur = await db.notes.get(nid);
      if (!cur) continue;
      await db.notes.update(nid, {
        purged: true, trashed: true, title: '', text: '', icon: '', content: null,
        updatedAt: nextTimestamp(cur.updatedAt), dirty: 1,
      });
    }
  });
  syncEngine.schedule();
}

/** Moves a note under a new parent (or to the root). Refuses to create cycles. */
export async function moveNote(id: string, parentId: string | null): Promise<boolean> {
  if (id === parentId) return false;
  if (parentId && (await descendants(id)).some((d) => d.id === parentId)) return false;
  const siblings = await siblingsOf(parentId);
  await updateNote(id, { parentId, sort: siblings.reduce((m, n) => Math.max(m, n.sort), 0) + 1 });
  return true;
}
