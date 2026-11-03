import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.ts';

export const recoveryCodes = sqliteTable('recovery_codes', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  // Null until the single-use code is spent during a recovery login.
  usedAt: integer('used_at'),
  createdAt: integer('created_at').notNull(),
});
