import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/db/index.ts';
import { note } from './helpers.ts';

function dbWithUsers(...ids: string[]) {
  const db = openDb(':memory:');
  for (const id of ids) db.createUser(id, `${id}@example.com`, 'hash');
  return db;
}

/** Drizzle wraps SQLite errors; the constraint message is on `cause`. */
const sqliteError = (re: RegExp) => (e: unknown) => re.test(String((e as Error).cause));

describe('openDb', () => {
  it('creates the parent directory and can reopen an existing file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'notes-db-')), 'nested', 'notes.db');
    const first = openDb(file);
    first.createUser('u1', 'a@example.com', 'hash');
    first.raw.close();
    assert.equal(existsSync(file), true);

    const second = openDb(file);
    assert.equal(second.userCount(), 1);
    assert.equal(second.currentSeq(), 0);
    second.raw.close();
  });

  it('records the applied migrations', () => {
    const db = openDb(':memory:');
    const rows = db.raw.prepare('SELECT name FROM __drizzle_migrations').all() as { name: string }[];
    assert.ok(rows.length >= 1);
    assert.match(rows[0].name, /_init$/);
  });

  it('enforces foreign keys', () => {
    const db = openDb(':memory:');
    assert.throws(() => db.applyChanges('no-such-user', [note('n1', 1)]), sqliteError(/FOREIGN KEY/));
  });
});

describe('users', () => {
  it('counts, creates and looks up users', () => {
    const db = openDb(':memory:');
    assert.equal(db.userCount(), 0);
    db.createUser('u1', 'Ada@Example.com', 'hash');
    assert.equal(db.userCount(), 1);
    assert.equal(db.userById('u1')?.email, 'Ada@Example.com');
    assert.equal(db.userById('missing'), undefined);
  });

  it('matches emails case-insensitively and keeps them unique', () => {
    const db = openDb(':memory:');
    db.createUser('u1', 'Ada@Example.com', 'hash');
    assert.equal(db.userByEmail('ada@example.COM')?.id, 'u1');
    assert.throws(() => db.createUser('u2', 'ADA@example.com', 'hash'), sqliteError(/UNIQUE constraint failed: users.email/));
  });

  it('stores the password hash and creation time', () => {
    const db = openDb(':memory:');
    const before = Date.now();
    db.createUser('u1', 'a@example.com', 'scrypt$salt$key');
    const user = db.userById('u1')!;
    assert.equal(user.passwordHash, 'scrypt$salt$key');
    assert.ok(user.createdAt >= before);
  });
});

describe('applyChanges / changesSince', () => {
  it('assigns increasing sequence numbers', () => {
    const db = dbWithUsers('u1');
    assert.equal(db.applyChanges('u1', [note('a', 1), note('b', 1)]), 2);
    assert.equal(db.currentSeq(), 2);
    assert.deepEqual(db.changesSince('u1', 0, 10).map((n) => [n.id, n.seq]), [['a', 1], ['b', 2]]);
  });

  it('round-trips every note field', () => {
    const db = dbWithUsers('u1');
    const input = note('a', 5, {
      parentId: 'p', title: 'T', icon: '🔥', content: { type: 'doc', content: [{ type: 'paragraph' }] },
      text: 'body', favorite: true, sort: 1.5, trashed: true, createdAt: 3,
    });
    db.applyChanges('u1', [input]);
    assert.deepEqual(db.changesSince('u1', 0, 10)[0], { ...input, seq: 1 });
  });

  it('stores missing content as null', () => {
    const db = dbWithUsers('u1');
    db.applyChanges('u1', [note('a', 1, { content: undefined })]);
    assert.equal(db.changesSince('u1', 0, 10)[0].content, null);
  });

  it('applies newer and equal timestamps, ignores older ones', () => {
    const db = dbWithUsers('u1');
    db.applyChanges('u1', [note('a', 100, { title: 'v1' })]);
    assert.equal(db.applyChanges('u1', [note('a', 50, { title: 'stale' })]), 0);
    assert.equal(db.applyChanges('u1', [note('a', 100, { title: 'tie' })]), 1);
    assert.equal(db.applyChanges('u1', [note('a', 200, { title: 'v2' })]), 1);

    const [current] = db.changesSince('u1', 0, 10);
    assert.equal(current.title, 'v2');
    assert.equal(current.seq, 3);
  });

  it('keeps the original createdAt on updates', () => {
    const db = dbWithUsers('u1');
    db.applyChanges('u1', [note('a', 1, { createdAt: 10 })]);
    db.applyChanges('u1', [note('a', 2, { createdAt: 999 })]);
    assert.equal(db.changesSince('u1', 0, 10)[0].createdAt, 10);
  });

  it("never lets one user overwrite another user's note", () => {
    const db = dbWithUsers('u1', 'u2');
    db.applyChanges('u1', [note('a', 1, { title: 'mine' })]);
    assert.equal(db.applyChanges('u2', [note('a', 999, { title: 'theirs' })]), 0);
    assert.equal(db.changesSince('u1', 0, 10)[0].title, 'mine');
    assert.deepEqual(db.changesSince('u2', 0, 10), []);
  });

  it('wipes content when a note is purged', () => {
    const db = dbWithUsers('u1');
    db.applyChanges('u1', [note('a', 2, { purged: true, trashed: true, title: 'secret', icon: '🔒', text: 'secret' })]);
    const [n] = db.changesSince('u1', 0, 10);
    assert.deepEqual([n.title, n.icon, n.text, n.content, n.purged], ['', '', '', null, true]);
  });

  it('rolls back the whole batch if any change fails', () => {
    const db = dbWithUsers('u1');
    const bad = { ...note('b', 1), title: null } as unknown as ReturnType<typeof note>;
    assert.throws(() => db.applyChanges('u1', [note('a', 1), bad]));
    assert.deepEqual(db.changesSince('u1', 0, 10), []);
    assert.equal(db.currentSeq(), 0);
  });

  it('filters by user and sequence, in order, with a limit', () => {
    const db = dbWithUsers('u1', 'u2');
    db.applyChanges('u1', [note('a', 1), note('b', 1)]);
    db.applyChanges('u2', [note('x', 1)]);
    db.applyChanges('u1', [note('c', 1)]);

    assert.deepEqual(db.changesSince('u1', 0, 10).map((n) => n.id), ['a', 'b', 'c']);
    assert.deepEqual(db.changesSince('u1', 2, 10).map((n) => n.id), ['c']);
    assert.deepEqual(db.changesSince('u1', 0, 2).map((n) => n.id), ['a', 'b']);
    assert.deepEqual(db.changesSince('u2', 0, 10).map((n) => n.id), ['x']);
  });
});

describe('relational queries', () => {
  it('loads a note with its user, parent and children', () => {
    const db = dbWithUsers('u1');
    db.applyChanges('u1', [note('root', 1, { title: 'Root' }), note('kid', 1, { title: 'Kid', parentId: 'root' })]);

    const root = db.drizzle.query.notes.findFirst({
      where: { id: 'root' },
      columns: { title: true },
      with: { user: { columns: { email: true } }, children: { columns: { title: true } } },
    }).sync();
    assert.deepEqual(root, { title: 'Root', user: { email: 'u1@example.com' }, children: [{ title: 'Kid' }] });

    const kid = db.drizzle.query.notes.findFirst({ where: { id: 'kid' }, with: { parent: { columns: { id: true } } } }).sync();
    assert.equal(kid?.parent?.id, 'root');
  });

  it("loads a user's notes", () => {
    const db = dbWithUsers('u1');
    db.applyChanges('u1', [note('a', 1), note('b', 1)]);
    const user = db.drizzle.query.users.findFirst({ where: { id: 'u1' }, with: { notes: { columns: { id: true } } } }).sync();
    assert.deepEqual(user?.notes.map((n) => n.id).sort(), ['a', 'b']);
  });
});
