import { defineRelations } from 'drizzle-orm';
import { meta } from './meta.ts';
import { notes } from './notes.ts';
import { users } from './users.ts';

export const relations = defineRelations({ users, notes, meta }, (r) => ({
  users: {
    notes: r.many.notes(),
  },
  notes: {
    user: r.one.users({ from: r.notes.userId, to: r.users.id, optional: false }),
    parent: r.one.notes({ from: r.notes.parentId, to: r.notes.id, alias: 'tree' }),
    children: r.many.notes({ alias: 'tree' }),
  },
}));
