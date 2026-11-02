import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Note } from '@notes/shared';

/** A row in the `notes` table (snake_case, booleans stored as 0/1, content as JSON text). */
interface NoteRow {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string;
  content: string;
  text: string;
  favorite: number;
  sort: number;
  trashed: number;
  purged: number;
  created_at: number;
  updated_at: number;
  seq: number;
}

/** A row in the `users` table. Never send this to the client: it contains the password hash. */
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
}

/** Opens (or creates) the SQLite database and returns typed helpers for every query the app needs. */
export function openDb(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT 'null',
      text TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0,
      sort REAL NOT NULL DEFAULT 0,
      trashed INTEGER NOT NULL DEFAULT 0,
      purged INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      seq INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_user_seq ON notes(user_id, seq);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO meta (key, value) VALUES ('seq', '0');
  `);

  const stmts = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    insertUser: db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'),
    noteOwner: db.prepare('SELECT user_id, updated_at FROM notes WHERE id = ?'),
    nextSeq: db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'seq' RETURNING CAST(value AS INTEGER) AS seq"),
    currentSeq: db.prepare("SELECT CAST(value AS INTEGER) AS seq FROM meta WHERE key = 'seq'"),
    upsertNote: db.prepare(`
      INSERT INTO notes (id, user_id, parent_id, title, icon, content, text, favorite, sort, trashed, purged, created_at, updated_at, seq)
      VALUES (:id, :user_id, :parent_id, :title, :icon, :content, :text, :favorite, :sort, :trashed, :purged, :created_at, :updated_at, :seq)
      ON CONFLICT(id) DO UPDATE SET
        parent_id = excluded.parent_id, title = excluded.title, icon = excluded.icon,
        content = excluded.content, text = excluded.text, favorite = excluded.favorite,
        sort = excluded.sort, trashed = excluded.trashed, purged = excluded.purged,
        updated_at = excluded.updated_at, seq = excluded.seq
    `),
    changesSince: db.prepare('SELECT * FROM notes WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?'),
  };

  function rowToNote(r: NoteRow): Note & { seq: number } {
    return {
      id: r.id,
      parentId: r.parent_id,
      title: r.title,
      icon: r.icon,
      content: JSON.parse(r.content),
      text: r.text,
      favorite: !!r.favorite,
      sort: r.sort,
      trashed: !!r.trashed,
      purged: !!r.purged,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      seq: r.seq,
    };
  }

  return {
    raw: db,
    userByEmail: (email: string) => stmts.userByEmail.get(email) as UserRow | undefined,
    userById: (id: string) => stmts.userById.get(id) as UserRow | undefined,
    userCount: () => (stmts.userCount.get() as { n: number }).n,
    createUser(id: string, email: string, hash: string) {
      stmts.insertUser.run(id, email, hash, Date.now());
    },
    currentSeq: () => (stmts.currentSeq.get() as { seq: number }).seq,

    /** Applies changes with last-writer-wins on updatedAt. Returns number applied. */
    applyChanges(userId: string, notes: Note[]): number {
      let applied = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const n of notes) {
          const existing = stmts.noteOwner.get(n.id) as { user_id: string; updated_at: number } | undefined;
          if (existing && existing.user_id !== userId) continue;
          if (existing && existing.updated_at > n.updatedAt) continue;
          const { seq } = stmts.nextSeq.get() as { seq: number };
          const purged = n.purged;
          stmts.upsertNote.run({
            id: n.id,
            user_id: userId,
            parent_id: n.parentId,
            title: purged ? '' : n.title,
            icon: purged ? '' : n.icon,
            content: purged ? 'null' : JSON.stringify(n.content ?? null),
            text: purged ? '' : n.text,
            favorite: n.favorite ? 1 : 0,
            sort: n.sort,
            trashed: n.trashed ? 1 : 0,
            purged: purged ? 1 : 0,
            created_at: n.createdAt,
            updated_at: n.updatedAt,
            seq,
          });
          applied++;
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return applied;
    },

    changesSince(userId: string, since: number, limit: number) {
      return (stmts.changesSince.all(userId, since, limit) as unknown as NoteRow[]).map(rowToNote);
    },
  };
}

export type Db = ReturnType<typeof openDb>;
