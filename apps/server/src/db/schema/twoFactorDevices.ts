import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.ts';

export const twoFactorDevices = sqliteTable('two_factor_devices', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  secret: text('secret').notNull(),
  // Null until the first valid code proves the device is set up correctly.
  confirmedAt: integer('confirmed_at'),
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
});
