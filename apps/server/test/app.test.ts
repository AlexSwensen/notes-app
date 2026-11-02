import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.ts';
import { buildApp } from '../src/app.ts';

function makeApp(allowSignup = true) {
  return buildApp({ db: openDb(':memory:'), secret: 'test-secret', allowSignup });
}

const note = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({
  id, parentId: null, title: `Title ${id}`, icon: '', content: { type: 'doc' }, text: 'hello world',
  favorite: false, sort: 0, trashed: false, purged: false, createdAt: 1, updatedAt, ...extra,
});

async function signup(app: ReturnType<typeof makeApp>, email = 'a@example.com') {
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'password123' } });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().token as string;
}

test('signup, login and auth', async () => {
  const app = makeApp();
  await signup(app);
  const dup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'A@example.com', password: 'password123' } });
  assert.equal(dup.statusCode, 409);
  const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@example.com', password: 'nope' } });
  assert.equal(bad.statusCode, 401);
  const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@example.com', password: 'password123' } });
  assert.equal(ok.statusCode, 200);
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${ok.json().token}` } });
  assert.equal(me.json().email, 'a@example.com');
  const unauth = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer forged.token' } });
  assert.equal(unauth.statusCode, 401);
});

test('signup disabled after first user when ALLOW_SIGNUP=false', async () => {
  const app = makeApp(false);
  await signup(app);
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'b@example.com', password: 'password123' } });
  assert.equal(res.statusCode, 403);
});

test('sync push/pull with last-writer-wins and user isolation', async () => {
  const app = makeApp();
  const a = await signup(app, 'a@example.com');
  const b = await signup(app, 'b@example.com');
  const sync = (token: string, payload: object) =>
    app.inject({ method: 'POST', url: '/api/sync', headers: { authorization: `Bearer ${token}` }, payload });

  let r = await sync(a, { since: 0, changes: [note('n1', 100), note('n2', 100)] });
  assert.equal(r.statusCode, 200);
  const seq1 = r.json().seq;
  assert.equal(r.json().changes.length, 2);

  // Another device pulls everything
  r = await sync(a, { since: 0, changes: [] });
  assert.deepEqual(r.json().changes.map((n: { id: string }) => n.id).sort(), ['n1', 'n2']);

  // Stale write is ignored, newer write wins
  await sync(a, { since: seq1, changes: [note('n1', 50, { title: 'stale' })] });
  r = await sync(a, { since: seq1, changes: [note('n1', 200, { title: 'fresh' })] });
  assert.equal(r.json().changes.length, 1);
  assert.equal(r.json().changes[0].title, 'fresh');

  // User B cannot see or overwrite A's notes
  r = await sync(b, { since: 0, changes: [note('n1', 999, { title: 'hijack' })] });
  assert.equal(r.json().changes.length, 0);
  r = await sync(a, { since: 0, changes: [] });
  assert.equal(r.json().changes.find((n: { id: string }) => n.id === 'n1').title, 'fresh');

  // Purge clears content
  r = await sync(a, { since: 0, changes: [note('n2', 300, { purged: true, trashed: true })] });
  const n2 = r.json().changes.find((n: { id: string }) => n.id === 'n2');
  assert.equal(n2.purged, true);
  assert.equal(n2.text, '');

  // Invalid payload rejected
  r = await sync(a, { since: 0, changes: [{ id: 'bad id!' }] });
  assert.equal(r.statusCode, 400);
});

test('static files, SPA fallback, and no HTML for missing assets', async () => {
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'notes-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Notes</title>');
  const app = buildApp({ db: openDb(':memory:'), secret: 's', allowSignup: true, staticDir: dir });

  let r = await app.inject({ url: '/p/some-page' });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'] as string, /text\/html/);
  assert.equal(r.headers['cache-control'], 'no-cache');

  r = await app.inject({ url: '/assets/missing.js' });
  assert.equal(r.statusCode, 404);

  // Files added after startup (e.g. a rebuild) are served, with immutable caching.
  writeFileSync(join(dir, 'assets', 'app-123.js'), 'console.log(1)');
  r = await app.inject({ url: '/assets/app-123.js' });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['cache-control'] as string, /immutable/);

  r = await app.inject({ url: '/api/unknown' });
  assert.equal(r.statusCode, 404);
});
