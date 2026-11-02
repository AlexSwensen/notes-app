import { customType, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Keeps email lookups and the unique constraint case-insensitive, as in the original schema.
const nocaseText = customType<{ data: string }>({ dataType: () => 'text COLLATE NOCASE' });

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: nocaseText('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});
