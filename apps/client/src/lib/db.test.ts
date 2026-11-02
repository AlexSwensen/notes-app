import { describe, expect, it } from 'vitest';
import { db, getMeta, noteTitle, setMeta, stripLocal } from './db';
import { makeNote } from '../test/factories';

describe('noteTitle', () => {
  it('returns the trimmed title', () => {
    expect(noteTitle({ title: '  Plans  ' })).toBe('Plans');
  });

  it('falls back to "Untitled" for blank titles', () => {
    expect(noteTitle({ title: '' })).toBe('Untitled');
    expect(noteTitle({ title: '   ' })).toBe('Untitled');
  });
});

describe('stripLocal', () => {
  it('removes the local-only dirty flag and keeps everything else', () => {
    const local = makeNote({ dirty: 1, title: 'Keep me' });
    const { dirty: _dirty, ...expected } = local;
    expect(stripLocal(local)).toEqual(expected);
    expect(stripLocal(local)).not.toHaveProperty('dirty');
  });
});

describe('meta store', () => {
  it('returns undefined for unknown keys', async () => {
    expect(await getMeta('missing')).toBeUndefined();
  });

  it('round-trips and overwrites values', async () => {
    await setMeta('seq', 5);
    expect(await getMeta<number>('seq')).toBe(5);
    await setMeta('seq', 9);
    expect(await getMeta<number>('seq')).toBe(9);
    expect(await db.meta.count()).toBe(1);
  });
});
