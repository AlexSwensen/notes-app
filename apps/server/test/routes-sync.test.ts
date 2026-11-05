import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, note, signup, sync } from './helpers.ts';

const ids = (body: { changes: { id: string }[] }) => body.changes.map((n) => n.id).sort();

describe('POST /api/sync', () => {
  it('requires authentication', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      payload: { since: 0, changes: [] },
    });
    assert.equal(res.statusCode, 401);
  });

  it('returns nothing for a new account', async () => {
    const app = makeApp();
    const res = await sync(app, await signup(app), { since: 0, changes: [] });
    assert.deepEqual(res.json(), { seq: 0, more: false, changes: [] });
  });

  it('treats a missing or invalid "since" as 0 and missing changes as none', async () => {
    const app = makeApp();
    const token = await signup(app);
    await sync(app, token, { since: 0, changes: [note('a', 1)] });

    for (const since of [undefined, 'abc', 1.5, -0.5]) {
      const res = await sync(app, token, { since });
      assert.deepEqual(ids(res.json()), ['a'], String(since));
    }
  });

  it('strips the internal sequence number from returned notes', async () => {
    const app = makeApp();
    const res = await sync(app, await signup(app), { since: 0, changes: [note('a', 1)] });
    assert.equal('seq' in res.json().changes[0], false);
    assert.equal(res.json().seq, 1);
  });

  it('only returns changes after "since"', async () => {
    const app = makeApp();
    const token = await signup(app);
    const first = (await sync(app, token, { since: 0, changes: [note('a', 1)] })).json();
    const second = (await sync(app, token, { since: first.seq, changes: [note('b', 1)] })).json();
    assert.deepEqual(ids(second), ['b']);
    assert.deepEqual(ids((await sync(app, token, { since: second.seq })).json()), []);
  });

  it('pages large pulls 500 at a time', async () => {
    const app = makeApp();
    const token = await signup(app);
    const batch = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => note(`n${from + i}`, 1));
    await sync(app, token, { since: 0, changes: batch(0, 500) });
    await sync(app, token, { since: 0, changes: batch(500, 20) });

    const page1 = (await sync(app, token, { since: 0 })).json();
    assert.equal(page1.changes.length, 500);
    assert.equal(page1.more, true);
    assert.equal(page1.seq, 500);

    const page2 = (await sync(app, token, { since: page1.seq })).json();
    assert.equal(page2.changes.length, 20);
    assert.equal(page2.more, false);
    assert.equal(page2.seq, 520);
  });

  it('rejects more than 500 changes in one request', async () => {
    const app = makeApp();
    const changes = Array.from({ length: 501 }, (_, i) => note(`n${i}`, 1));
    const res = await sync(app, await signup(app), { since: 0, changes });
    assert.equal(res.statusCode, 413);
  });

  const invalid: [string, Record<string, unknown>][] = [
    ['id with spaces', { id: 'bad id' }],
    ['overlong id', { id: 'x'.repeat(65) }],
    ['numeric id', { id: 5 }],
    ['invalid parentId', { parentId: '../etc' }],
    ['non-string title', { title: 7 }],
    ['overlong title', { title: 'x'.repeat(1001) }],
    ['overlong icon', { icon: 'x'.repeat(33) }],
    ['non-string text', { text: null }],
    ['non-boolean favorite', { favorite: 'yes' }],
    ['infinite sort', { sort: Infinity }],
    ['non-boolean trashed', { trashed: 1 }],
    ['non-boolean purged', { purged: 0 }],
    ['fractional createdAt', { createdAt: 1.5 }],
    ['string updatedAt', { updatedAt: '2024' }],
    ['oversized content', { content: { blob: 'x'.repeat(5 * 1024 * 1024) } }],
  ];
  for (const [label, patch] of invalid) {
    it(`rejects a note with ${label}`, async () => {
      const app = makeApp();
      const token = await signup(app);
      const res = await sync(app, token, {
        since: 0,
        changes: [note('ok', 1), { ...note('bad', 1), ...patch }],
      });
      assert.equal(res.statusCode, 400);
      // Nothing from the rejected batch is stored.
      assert.deepEqual(ids((await sync(app, token, { since: 0 })).json()), []);
    });
  }

  it('rejects non-object changes', async () => {
    const app = makeApp();
    const res = await sync(app, await signup(app), { since: 0, changes: [null] });
    assert.equal(res.statusCode, 400);
  });

  it('accepts child notes and null content', async () => {
    const app = makeApp();
    const res = await sync(app, await signup(app), {
      since: 0,
      changes: [note('child', 1, { parentId: 'parent', content: null })],
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().changes[0].parentId, 'parent');
  });
});
