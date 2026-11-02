import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.ts';

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    title: text('title').notNull().default(''),
    icon: text('icon').notNull().default(''),
    content: text('content').notNull().default('null'),
    text: text('text').notNull().default(''),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
    sort: real('sort').notNull().default(0),
    trashed: integer('trashed', { mode: 'boolean' }).notNull().default(false),
    purged: integer('purged', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    seq: integer('seq').notNull(),
  },
  (t) => [index('notes_user_seq').on(t.userId, t.seq)],
);
