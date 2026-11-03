import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { and, count, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import type { Note } from '@sheafly/shared';
import { meta } from './schema/meta.ts';
import { notes } from './schema/notes.ts';
import { users } from './schema/users.ts';
import { twoFactorDevices } from './schema/twoFactorDevices.ts';
import { recoveryCodes } from './schema/recoveryCodes.ts';
import { relations } from './schema/relations.ts';

type NoteRow = typeof notes.$inferSelect;

/** A row in the `users` table. Never send this to the client: it contains the password hash. */
export type UserRow = typeof users.$inferSelect;

/** A row in the `two_factor_devices` table. The `secret` must never be sent to the client. */
export type TwoFactorDeviceRow = typeof twoFactorDevices.$inferSelect;


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
    updateUserEmail(id: string, email: string) {
      db.update(users).set({ email }).where(eq(users.id, id)).run();
    },
    updateUserPassword(id: string, hash: string) {
      db.update(users).set({ passwordHash: hash }).where(eq(users.id, id)).run();
    },

    // --- Two-factor devices ---
    twoFactorDevices: (userId: string) =>
      db.select().from(twoFactorDevices).where(eq(twoFactorDevices.userId, userId)).orderBy(twoFactorDevices.createdAt).all(),
    twoFactorDeviceById: (id: string) => db.select().from(twoFactorDevices).where(eq(twoFactorDevices.id, id)).get(),
    confirmedTwoFactorDevices: (userId: string) =>
      db
        .select()
        .from(twoFactorDevices)
        .where(and(eq(twoFactorDevices.userId, userId), isNotNull(twoFactorDevices.confirmedAt)))
        .all(),
    confirmedDeviceCount: (userId: string) =>
      db
        .select({ n: count() })
        .from(twoFactorDevices)
        .where(and(eq(twoFactorDevices.userId, userId), isNotNull(twoFactorDevices.confirmedAt)))
        .get()!.n,
    createTwoFactorDevice(id: string, userId: string, name: string, secret: string) {
      db.insert(twoFactorDevices).values({ id, userId, name, secret, createdAt: Date.now() }).run();
    },
    confirmTwoFactorDevice(id: string, at: number) {
      db.update(twoFactorDevices).set({ confirmedAt: at, lastUsedAt: at }).where(eq(twoFactorDevices.id, id)).run();
    },
    touchTwoFactorDevice(id: string, at: number) {
      db.update(twoFactorDevices).set({ lastUsedAt: at }).where(eq(twoFactorDevices.id, id)).run();
    },
    deleteTwoFactorDevice(id: string) {
      db.delete(twoFactorDevices).where(eq(twoFactorDevices.id, id)).run();
    },
    /** Removes still-pending enrollments so a user has at most one in flight at a time. */
    deleteUnconfirmedTwoFactorDevices(userId: string) {
      db
        .delete(twoFactorDevices)
        .where(and(eq(twoFactorDevices.userId, userId), isNull(twoFactorDevices.confirmedAt)))
        .run();
    },

    // --- Recovery codes ---
    unusedRecoveryCodes: (userId: string) =>
      db
        .select()
        .from(recoveryCodes)
        .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)))
        .all(),
    countUnusedRecoveryCodes: (userId: string) =>
      db
        .select({ n: count() })
        .from(recoveryCodes)
        .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)))
        .get()!.n,
    consumeRecoveryCode(id: string, at: number) {
      db.update(recoveryCodes).set({ usedAt: at }).where(eq(recoveryCodes.id, id)).run();
    },
    deleteRecoveryCodes(userId: string) {
      db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run();
    },
    /** Atomically replaces every recovery code for a user with a fresh batch of hashes. */
    replaceRecoveryCodes(userId: string, hashes: string[]) {
      const now = Date.now();
      db.transaction((tx) => {
        tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run();
        for (const codeHash of hashes) {
          tx.insert(recoveryCodes).values({ id: randomUUID(), userId, codeHash, createdAt: now }).run();
        }
      });
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
