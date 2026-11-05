import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNoteTree } from './useNoteTree';
import { makeNote } from '../test/factories';

describe('useNoteTree', () => {
  it('indexes every note by id, including trashed ones', () => {
    const live = makeNote();
    const trashed = makeNote({ trashed: true });
    const { result } = renderHook(() => useNoteTree([live, trashed]));

    expect([...result.current.byId.keys()]).toEqual([live.id, trashed.id]);
  });

  it('groups live notes by parent and leaves out trashed and purged ones', () => {
    const root = makeNote({ id: 'root' });
    const child = makeNote({ parentId: 'root' });
    const trashedChild = makeNote({ parentId: 'root', trashed: true });
    const purged = makeNote({ purged: true, trashed: true });
    const { result } = renderHook(() => useNoteTree([root, child, trashedChild, purged]));

    expect(result.current.tree.get(null)!.map((n) => n.id)).toEqual(['root']);
    expect(result.current.tree.get('root')!.map((n) => n.id)).toEqual([child.id]);
  });

  it('shows notes whose parent is missing at the top level', () => {
    const orphan = makeNote({ parentId: 'not-synced-yet' });
    const { result } = renderHook(() => useNoteTree([orphan]));

    expect(result.current.tree.get(null)!.map((n) => n.id)).toEqual([orphan.id]);
    expect(result.current.tree.has('not-synced-yet')).toBe(false);
  });

  it('sorts siblings by sort, then by creation time', () => {
    const c = makeNote({ id: 'c', sort: 2, createdAt: 1 });
    const b = makeNote({ id: 'b', sort: 1, createdAt: 9 });
    const a = makeNote({ id: 'a', sort: 1, createdAt: 5 });
    const { result } = renderHook(() => useNoteTree([c, b, a]));

    expect(result.current.tree.get(null)!.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('lists live favorites alphabetically', () => {
    const notes = [
      makeNote({ title: 'Zebra', favorite: true }),
      makeNote({ title: 'apple', favorite: true }),
      makeNote({ title: 'Mango', favorite: true, trashed: true }),
      makeNote({ title: 'Banana' }),
    ];
    const { result } = renderHook(() => useNoteTree(notes));

    expect(result.current.favorites.map((n) => n.title)).toEqual(['apple', 'Zebra']);
  });

  it('counts unsynced notes', () => {
    const { result } = renderHook(() =>
      useNoteTree([makeNote({ dirty: 1 }), makeNote(), makeNote({ dirty: 1, trashed: true })]),
    );
    expect(result.current.dirtyCount).toBe(2);
  });

  it('returns the same result while the notes array is unchanged', () => {
    const notes = [makeNote()];
    const { result, rerender } = renderHook(({ list }) => useNoteTree(list), {
      initialProps: { list: notes },
    });
    const first = result.current;

    rerender({ list: notes });
    expect(result.current).toBe(first);
    rerender({ list: [...notes] });
    expect(result.current).not.toBe(first);
  });
});
