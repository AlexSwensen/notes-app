import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { createNote, moveNote, purgeNote, restoreNote, trashNote, updateNote } from './notes';
import { syncEngine } from './sync';
import { makeNote } from '../test/factories';

let schedule: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  schedule = vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});
});

/** root ─ child ─ grandchild, plus an unrelated sibling at the top level. */
async function seedTree() {
  const root = makeNote({ id: 'root', sort: 1 });
  const child = makeNote({ id: 'child', parentId: 'root', sort: 1 });
  const grandchild = makeNote({ id: 'grandchild', parentId: 'child', sort: 1 });
  const sibling = makeNote({ id: 'sibling', sort: 2 });
  await db.notes.bulkAdd([root, child, grandchild, sibling]);
  return { root, child, grandchild, sibling };
}

describe('createNote', () => {
  it('creates an empty, dirty top-level note and schedules a sync', async () => {
    const id = await createNote();
    const note = await db.notes.get(id);

    expect(note).toMatchObject({
      parentId: null,
      title: '',
      content: null,
      dirty: 1,
      trashed: false,
      purged: false,
    });
    expect(note!.createdAt).toBe(note!.updatedAt);
    expect(schedule).toHaveBeenCalled();
  });

  it('places the note after its existing siblings', async () => {
    await seedTree();
    const topLevel = await db.notes.get(await createNote(null));
    const nested = await db.notes.get(await createNote('root'));

    expect(topLevel!.sort).toBe(3);
    expect(nested!.sort).toBe(2);
    expect(nested!.parentId).toBe('root');
  });

  it('applies initial values', async () => {
    const id = await createNote(null, { title: 'From search', icon: '🚀' });
    expect(await db.notes.get(id)).toMatchObject({ title: 'From search', icon: '🚀' });
  });

  it('generates unique ids', async () => {
    const ids = await Promise.all([createNote(), createNote(), createNote()]);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('updateNote', () => {
  it('patches the note, marks it dirty and bumps updatedAt', async () => {
    await db.notes.add(makeNote({ id: 'n', updatedAt: 1000 }));
    vi.spyOn(Date, 'now').mockReturnValue(5000);

    await updateNote('n', { title: 'Renamed' });
    expect(await db.notes.get('n')).toMatchObject({ title: 'Renamed', dirty: 1, updatedAt: 5000 });
    expect(schedule).toHaveBeenCalled();
  });

  it('keeps updatedAt increasing even if the clock goes backwards', async () => {
    await db.notes.add(makeNote({ id: 'n', updatedAt: 9000 }));
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    await updateNote('n', { title: 'a' });
    await updateNote('n', { title: 'b' });
    expect((await db.notes.get('n'))!.updatedAt).toBe(9002);
  });

  it('ignores unknown ids', async () => {
    await updateNote('missing', { title: 'x' });
    expect(await db.notes.count()).toBe(0);
  });
});

describe('trashNote', () => {
  it('trashes the note and all its descendants, but not siblings', async () => {
    await seedTree();
    await trashNote('root');

    const byId = Object.fromEntries((await db.notes.toArray()).map((n) => [n.id, n]));
    expect(byId.root.trashed).toBe(true);
    expect(byId.child.trashed).toBe(true);
    expect(byId.grandchild.trashed).toBe(true);
    expect(byId.sibling.trashed).toBe(false);
    expect(byId.grandchild.dirty).toBe(1);
  });

  it('leaves already-purged descendants untouched', async () => {
    await seedTree();
    await db.notes.update('child', { purged: true, trashed: true, updatedAt: 1 });
    await trashNote('root');

    expect(await db.notes.get('child')).toMatchObject({ updatedAt: 1, dirty: 0 });
  });
});

describe('restoreNote', () => {
  it('restores the note and its descendants', async () => {
    await seedTree();
    await trashNote('root');
    await restoreNote('root');

    expect((await db.notes.toArray()).every((n) => !n.trashed)).toBe(true);
  });

  it('keeps a restored child under its parent when the parent is live', async () => {
    await seedTree();
    await trashNote('child');
    await restoreNote('child');

    expect(await db.notes.get('child')).toMatchObject({ parentId: 'root', trashed: false });
  });

  it('moves the note to the top level if its parent is still in the trash', async () => {
    await seedTree();
    await trashNote('root');
    await restoreNote('child');

    expect(await db.notes.get('child')).toMatchObject({ parentId: null, trashed: false });
    expect(await db.notes.get('grandchild')).toMatchObject({ parentId: 'child', trashed: false });
    expect((await db.notes.get('root'))!.trashed).toBe(true);
  });

  it('moves the note to the top level if its parent no longer exists', async () => {
    await db.notes.add(makeNote({ id: 'orphan', parentId: 'gone', trashed: true }));
    await restoreNote('orphan');

    expect(await db.notes.get('orphan')).toMatchObject({ parentId: null, trashed: false });
  });
});

describe('purgeNote', () => {
  it('turns the subtree into empty tombstones', async () => {
    await seedTree();
    await db.notes.update('child', {
      title: 'Secret',
      text: 'body',
      icon: '🔒',
      content: { type: 'doc' },
    });
    await purgeNote('root');

    for (const id of ['root', 'child', 'grandchild']) {
      expect(await db.notes.get(id)).toMatchObject({
        purged: true,
        trashed: true,
        title: '',
        text: '',
        icon: '',
        content: null,
        dirty: 1,
      });
    }
    expect((await db.notes.get('sibling'))!.purged).toBe(false);
  });

  it('ignores unknown ids', async () => {
    await purgeNote('missing');
    expect(await db.notes.count()).toBe(0);
  });
});

describe('moveNote', () => {
  it('refuses to move a note into itself', async () => {
    await seedTree();
    expect(await moveNote('root', 'root')).toBe(false);
  });

  it('refuses to move a note into one of its descendants', async () => {
    await seedTree();
    expect(await moveNote('root', 'grandchild')).toBe(false);
    expect((await db.notes.get('root'))!.parentId).toBeNull();
  });

  it('moves a note under a new parent, after the existing children', async () => {
    await seedTree();
    expect(await moveNote('sibling', 'root')).toBe(true);
    expect(await db.notes.get('sibling')).toMatchObject({ parentId: 'root', sort: 2, dirty: 1 });
  });

  it('moves a note to the top level', async () => {
    await seedTree();
    expect(await moveNote('grandchild', null)).toBe(true);
    expect(await db.notes.get('grandchild')).toMatchObject({ parentId: null, sort: 3 });
  });
});
