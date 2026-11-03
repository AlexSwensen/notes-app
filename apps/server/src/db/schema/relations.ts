import { defineRelations } from 'drizzle-orm';
import { meta } from './meta.ts';
import { notes } from './notes.ts';
import { users } from './users.ts';
import { twoFactorDevices } from './twoFactorDevices.ts';
import { recoveryCodes } from './recoveryCodes.ts';

export const relations = defineRelations({ users, notes, meta, twoFactorDevices, recoveryCodes }, (r) => ({
  users: {
    notes: r.many.notes(),
    twoFactorDevices: r.many.twoFactorDevices(),
    recoveryCodes: r.many.recoveryCodes(),
  },
  notes: {
    user: r.one.users({ from: r.notes.userId, to: r.users.id, optional: false }),
    parent: r.one.notes({ from: r.notes.parentId, to: r.notes.id, alias: 'tree' }),
    children: r.many.notes({ alias: 'tree' }),
  },
  twoFactorDevices: {
    user: r.one.users({ from: r.twoFactorDevices.userId, to: r.users.id, optional: false }),
  },
  recoveryCodes: {
    user: r.one.users({ from: r.recoveryCodes.userId, to: r.users.id, optional: false }),
  },
}));
