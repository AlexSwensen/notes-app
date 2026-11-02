import { beforeEach, describe, expect, it } from 'vitest';
import { escapeRegExp, searchIndex, snippet } from './search';
import { makeNote } from '../test/factories';

describe('searchIndex', () => {
  beforeEach(() => searchIndex.update([]));

  it('returns nothing for a blank query', () => {
    searchIndex.update([makeNote({ title: 'Groceries' })]);
    expect(searchIndex.search('')).toEqual([]);
    expect(searchIndex.search('   ')).toEqual([]);
  });

  it('matches titles and body text by prefix, reporting matched terms', () => {
    const a = makeNote({ title: 'Groceries', text: 'milk and eggs' });
    const b = makeNote({ title: 'Recipes', text: 'pancakes need eggs' });
    searchIndex.update([a, b]);

    expect(searchIndex.search('groc').map((h) => h.id)).toEqual([a.id]);
    const eggs = searchIndex.search('eggs');
    expect(eggs.map((h) => h.id).sort()).toEqual([a.id, b.id].sort());
    expect(eggs[0].terms).toContain('eggs');
  });

  it('ranks title matches above body matches', () => {
    const inBody = makeNote({ title: 'Misc', text: 'roadmap draft' });
    const inTitle = makeNote({ title: 'Roadmap', text: 'q3 goals' });
    searchIndex.update([inBody, inTitle]);

    expect(searchIndex.search('roadmap')[0].id).toBe(inTitle.id);
  });

  it('requires every term to match', () => {
    const a = makeNote({ title: 'Trip', text: 'paris hotel' });
    const b = makeNote({ title: 'Trip', text: 'rome hotel' });
    searchIndex.update([a, b]);

    expect(searchIndex.search('hotel paris').map((h) => h.id)).toEqual([a.id]);
  });

  it('tolerates small typos', () => {
    const a = makeNote({ title: 'Kubernetes notes' });
    searchIndex.update([a]);

    expect(searchIndex.search('kubernets').map((h) => h.id)).toEqual([a.id]);
  });

  it('excludes trashed and purged notes', () => {
    const live = makeNote({ title: 'Budget' });
    const trashed = makeNote({ title: 'Budget old', trashed: true });
    const purged = makeNote({ title: 'Budget older', purged: true, trashed: true });
    searchIndex.update([live, trashed, purged]);

    expect(searchIndex.search('budget').map((h) => h.id)).toEqual([live.id]);
  });

  it('drops notes that disappear or get trashed', () => {
    const a = makeNote({ title: 'Alpha' });
    const b = makeNote({ title: 'Alphabet' });
    searchIndex.update([a, b]);
    searchIndex.update([{ ...a, trashed: true, updatedAt: a.updatedAt + 1 }]);

    expect(searchIndex.search('alpha')).toEqual([]);
  });

  it('re-indexes a note when its updatedAt changes', () => {
    const a = makeNote({ title: 'Draft' });
    searchIndex.update([a]);
    searchIndex.update([{ ...a, title: 'Final', updatedAt: a.updatedAt + 1 }]);

    expect(searchIndex.search('draft')).toEqual([]);
    expect(searchIndex.search('final').map((h) => h.id)).toEqual([a.id]);
  });

  it('respects the result limit', () => {
    searchIndex.update(Array.from({ length: 5 }, () => makeNote({ title: 'Meeting' })));

    expect(searchIndex.search('meeting')).toHaveLength(5);
    expect(searchIndex.search('meeting', 2)).toHaveLength(2);
  });
});

describe('snippet', () => {
  const long = `${'a'.repeat(100)} needle ${'b'.repeat(100)}`;

  it('returns the start of the text when nothing matches', () => {
    expect(snippet('short text', ['zzz'])).toBe('short text');
    expect(snippet(long, ['zzz'], 10)).toBe(long.slice(0, 20));
  });

  it('centres on the match with ellipses on cut sides', () => {
    const s = snippet(long, ['needle'], 10);
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('needle');
  });

  it('omits ellipses when the excerpt reaches the edges', () => {
    expect(snippet('needle at start', ['needle'], 70)).toBe('needle at start');
  });

  it('uses the earliest matching term, case-insensitively', () => {
    const s = snippet(`${'x'.repeat(50)} Second ${'y'.repeat(50)} First`, ['first', 'SECOND'], 10);
    expect(s).toContain('Second');
    expect(s).not.toContain('First');
  });

  it('collapses whitespace', () => {
    expect(snippet('one\n\n  two\tthree', ['two'])).toBe('one two three');
  });
});

describe('escapeRegExp', () => {
  it('escapes every regex metacharacter', () => {
    const special = '.*+?^${}()|[]\\';
    expect(new RegExp(escapeRegExp(special)).test(`x${special}x`)).toBe(true);
    expect(escapeRegExp('a.b')).toBe('a\\.b');
  });

  it('leaves plain text alone', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
  });
});
