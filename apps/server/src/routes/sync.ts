import type { FastifyInstance } from 'fastify';
import type { Note, SyncResponse } from '@sheafly/shared';
import type { AppContext } from '../app.ts';

const MAX_CHANGES = 500;
const PULL_LIMIT = 500;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Checks an untrusted value from the request body before it goes near the database. */
function isValidNote(n: unknown): n is Note {
  if (!n || typeof n !== 'object') return false;
  const o = n as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    ID_RE.test(o.id) &&
    (o.parentId === null || (typeof o.parentId === 'string' && ID_RE.test(o.parentId))) &&
    typeof o.title === 'string' &&
    o.title.length <= 1000 &&
    typeof o.icon === 'string' &&
    o.icon.length <= 32 &&
    typeof o.text === 'string' &&
    typeof o.favorite === 'boolean' &&
    typeof o.sort === 'number' &&
    Number.isFinite(o.sort) &&
    typeof o.trashed === 'boolean' &&
    typeof o.purged === 'boolean' &&
    Number.isSafeInteger(o.createdAt) &&
    Number.isSafeInteger(o.updatedAt) &&
    JSON.stringify(o.content ?? null).length <= MAX_CONTENT_BYTES
  );
}

/**
 * `POST /api/sync`: the client pushes its unsynced notes and pulls every note
 * that changed since the last sequence number it saw. See "How sync works" in the README.
 */
export function registerSyncRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, sse } = ctx;

  app.post('/api/sync', async (req, reply) => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const body = (req.body ?? {}) as { since?: unknown; changes?: unknown; clientId?: unknown };
    const since = Number.isSafeInteger(body.since) ? (body.since as number) : 0;
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length > MAX_CHANGES)
      return reply.code(413).send({ error: `At most ${MAX_CHANGES} changes per request` });
    if (!changes.every(isValidNote))
      return reply.code(400).send({ error: 'Invalid note in changes' });

    const applied = changes.length ? db.applyChanges(userId, changes) : 0;
    // Fetch one extra row to find out whether there is another page.
    const pulled = db.changesSince(userId, since, PULL_LIMIT + 1);
    const more = pulled.length > PULL_LIMIT;
    if (more) pulled.length = PULL_LIMIT;
    const seq = more ? pulled[pulled.length - 1].seq : Math.max(since, db.currentSeq());
    if (applied) sse.broadcast(userId, String(body.clientId ?? ''), db.currentSeq());
    const res: SyncResponse = { seq, more, changes: pulled.map(({ seq: _s, ...n }) => n) };
    return res;
  });
}
