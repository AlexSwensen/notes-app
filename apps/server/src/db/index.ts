import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import type { Note } from '@notes/shared';
import { meta } from './schema/meta.ts';
import { notes } from './schema/notes.ts';
import { users } from './schema/users.ts';
import { relations } from './schema/relations.ts';

type NoteRow = typeof notes.$inferSelect;

/** A row in the `users` table. Never send this to the client: it contains the password hash. */
export type UserRow = typeof users.$inferSelect;

/** Opens (or creates) the SQLite database, applies migrations, and returns typed helpers for every query the app needs. */
export function openDb(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const db = drizzle({ client: sqlite, relations });
  migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });

  const seqValue = sql<number>`CAST(${meta.value} AS INTEGER)`;

  function rowToNote(r: NoteRow): Note & { seq: number } {
    const { userId: _, content, ...rest } = r;
    return { ...rest, content: JSON.parse(content) };
  }

  return {
    raw: sqlite,
    drizzle: db,
    userByEmail: (email: string) => db.query.users.findFirst({ where: { email } }).sync(),
    userById: (id: string) => db.query.users.findFirst({ where: { id } }).sync(),
    userCount: () => db.select({ n: count() }).from(users).get()!.n,
    createUser(id: string, email: string, hash: string) {
      db.insert(users).values({ id, email, passwordHash: hash, createdAt: Date.now() }).run();
    },
    currentSeq: () => db.select({ seq: seqValue }).from(meta).where(eq(meta.key, 'seq')).get()!.seq,

    /** Applies changes with last-writer-wins on updatedAt. Returns number applied. */
    applyChanges(userId: string, changes: Note[]): number {
      return db.transaction(
        (tx) => {
          let applied = 0;
          for (const n of changes) {
            const existing = tx
              .select({ userId: notes.userId, updatedAt: notes.updatedAt })
              .from(notes)
              .where(eq(notes.id, n.id))
              .get();
            if (existing && existing.userId !== userId) continue;
            if (existing && existing.updatedAt > n.updatedAt) continue;
            const { seq } = tx
              .update(meta)
              .set({ value: sql`${seqValue} + 1` })
              .where(eq(meta.key, 'seq'))
              .returning({ seq: seqValue })
              .get()!;
            const purged = n.purged;
            const values = {
              parentId: n.parentId,
              title: purged ? '' : n.title,
              icon: purged ? '' : n.icon,
              content: purged ? 'null' : JSON.stringify(n.content ?? null),
              text: purged ? '' : n.text,
              favorite: n.favorite,
              sort: n.sort,
              trashed: n.trashed,
              purged,
              updatedAt: n.updatedAt,
              seq,
            };
            tx.insert(notes)
              .values({ id: n.id, userId, createdAt: n.createdAt, ...values })
              .onConflictDoUpdate({ target: notes.id, set: values })
              .run();
            applied++;
          }
          return applied;
        },
        { behavior: 'immediate' },
      );
    },

    changesSince(userId: string, since: number, limit: number) {
      return db
        .select()
        .from(notes)
        .where(and(eq(notes.userId, userId), gt(notes.seq, since)))
        .orderBy(notes.seq)
        .limit(limit)
        .all()
        .map(rowToNote);
    },
  };
}

export type Db = ReturnType<typeof openDb>;
