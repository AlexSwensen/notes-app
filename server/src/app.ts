import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import type { Db, Note } from './db.ts';
import { hashPassword, verifyPassword, createTokenService } from './auth.ts';

export interface AppOptions {
  db: Db;
  secret: string;
  allowSignup: boolean;
  staticDir?: string;
  logger?: boolean;
  trustProxy?: boolean;
}

const MAX_CHANGES = 500;
const PULL_LIMIT = 500;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validNote(n: unknown): n is Note {
  if (!n || typeof n !== 'object') return false;
  const o = n as Record<string, unknown>;
  return (
    typeof o.id === 'string' && ID_RE.test(o.id) &&
    (o.parentId === null || (typeof o.parentId === 'string' && ID_RE.test(o.parentId))) &&
    typeof o.title === 'string' && o.title.length <= 1000 &&
    typeof o.icon === 'string' && o.icon.length <= 32 &&
    typeof o.text === 'string' &&
    typeof o.favorite === 'boolean' &&
    typeof o.sort === 'number' && Number.isFinite(o.sort) &&
    typeof o.trashed === 'boolean' &&
    typeof o.purged === 'boolean' &&
    Number.isSafeInteger(o.createdAt) &&
    Number.isSafeInteger(o.updatedAt) &&
    JSON.stringify(o.content ?? null).length <= MAX_CONTENT_BYTES
  );
}

export function buildApp(opts: AppOptions) {
  const { db } = opts;
  const tokens = createTokenService(opts.secret);
  const app = Fastify({
    logger: opts.logger
      ? {
          serializers: {
            // Never log the SSE auth token from the query string.
            req: (req) => ({ method: req.method, url: req.url.replace(/token=[^&]*/, 'token=[redacted]'), remoteAddress: req.ip }),
          },
        }
      : false,
    bodyLimit: 50 * 1024 * 1024,
    trustProxy: opts.trustProxy ?? false,
  });

  // userId -> open SSE streams (tagged with their client id)
  const streams = new Map<string, Set<{ res: ServerResponse; clientId: string }>>();

  function broadcast(userId: string, originClientId: string, seq: number) {
    for (const s of streams.get(userId) ?? []) {
      if (s.clientId === originClientId) continue;
      s.res.write(`event: change\ndata: ${JSON.stringify({ seq })}\n\n`);
    }
  }

  const loginAttempts = new Map<string, { count: number; reset: number }>();
  function rateLimited(ip: string): boolean {
    const now = Date.now();
    if (loginAttempts.size > 10_000) {
      for (const [k, v] of loginAttempts) if (v.reset < now) loginAttempts.delete(k);
    }
    const entry = loginAttempts.get(ip);
    if (!entry || entry.reset < now) {
      loginAttempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
      return false;
    }
    entry.count++;
    return entry.count > 20;
  }

  function authUser(req: FastifyRequest): string | null {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const userId = tokens.verify(token);
    return userId && db.userById(userId) ? userId : null;
  }

  function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
    const userId = authUser(req);
    if (!userId) reply.code(401).send({ error: 'Unauthorized' });
    return userId;
  }

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/config', async () => ({ allowSignup: opts.allowSignup || db.userCount() === 0 }));

  app.post('/api/auth/signup', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (!opts.allowSignup && db.userCount() > 0) return reply.code(403).send({ error: 'Sign-ups are disabled on this server' });
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) return reply.code(400).send({ error: 'Enter a valid email' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    if (rateLimited(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    if (db.userByEmail(email)) return reply.code(409).send({ error: 'An account with that email already exists' });
    const id = randomUUID();
    db.createUser(id, email.trim(), await hashPassword(password));
    return { token: tokens.issue(id), user: { id, email } };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof email !== 'string' || typeof password !== 'string') return reply.code(400).send({ error: 'Email and password required' });
    if (rateLimited(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    const user = db.userByEmail(email.trim());
    if (!user || !(await verifyPassword(password, user.password_hash))) return reply.code(401).send({ error: 'Invalid email or password' });
    return { token: tokens.issue(user.id), user: { id: user.id, email: user.email } };
  });

  app.get('/api/me', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const user = db.userById(userId)!;
    return { id: user.id, email: user.email };
  });

  app.post('/api/sync', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const body = (req.body ?? {}) as { since?: unknown; changes?: unknown; clientId?: unknown };
    const since = Number.isSafeInteger(body.since) ? (body.since as number) : 0;
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length > MAX_CHANGES) return reply.code(413).send({ error: `At most ${MAX_CHANGES} changes per request` });
    if (!changes.every(validNote)) return reply.code(400).send({ error: 'Invalid note in changes' });

    const applied = changes.length ? db.applyChanges(userId, changes) : 0;
    const pulled = db.changesSince(userId, since, PULL_LIMIT + 1);
    const more = pulled.length > PULL_LIMIT;
    if (more) pulled.length = PULL_LIMIT;
    const seq = more ? pulled[pulled.length - 1].seq : Math.max(since, db.currentSeq());
    if (applied) broadcast(userId, String(body.clientId ?? ''), db.currentSeq());
    return { seq, more, changes: pulled.map(({ seq: _s, ...n }) => n) };
  });

  app.get('/api/events', (req, reply) => {
    const q = req.query as { token?: string; clientId?: string };
    const userId = tokens.verify(q.token);
    if (!userId || !db.userById(userId)) return reply.code(401).send({ error: 'Unauthorized' });
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\n\n`);
    const entry = { res, clientId: String(q.clientId ?? '') };
    if (!streams.has(userId)) streams.set(userId, new Set());
    streams.get(userId)!.add(entry);
    const ping = setInterval(() => res.write(`: ping\n\n`), 25000);
    req.raw.on('close', () => {
      clearInterval(ping);
      streams.get(userId)?.delete(entry);
    });
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.register(fastifyStatic, {
      root: opts.staticDir,
      cacheControl: false,
      setHeaders(reply: { header: (k: string, v: string) => unknown }, path: string) {
        const immutable = /[\\/]assets[\\/]/.test(path);
        reply.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      // SPA fallback only for page navigations, never for missing files like stale /assets/*.js.
      const path = req.url.split('?')[0];
      if (req.method === 'GET' && !path.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(path)) {
        return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
      }
      reply.code(404).send({ error: 'Not found' });
    });
  }

  app.addHook('onClose', async () => {
    for (const set of streams.values()) for (const s of set) s.res.end();
  });

  return app;
}
