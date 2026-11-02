import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthResponse, ConfigResponse, User } from '@notes/shared';
import type { AppContext } from '../app.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { createRateLimiter } from '../auth/rate-limit.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `/api/config`, `/api/auth/signup`, `/api/auth/login` and `/api/me`. */
export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, tokens } = ctx;
  const isRateLimited = createRateLimiter();
  // The very first account can always be created, even with sign-ups disabled.
  const signupOpen = () => ctx.allowSignup || db.userCount() === 0;

  app.get('/api/config', async (): Promise<ConfigResponse> => ({ allowSignup: signupOpen() }));

  app.post('/api/auth/signup', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (!signupOpen()) return reply.code(403).send({ error: 'Sign-ups are disabled on this server' });
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) return reply.code(400).send({ error: 'Enter a valid email' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    if (isRateLimited(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    if (db.userByEmail(email)) return reply.code(409).send({ error: 'An account with that email already exists' });
    const id = randomUUID();
    db.createUser(id, email.trim(), await hashPassword(password));
    const res: AuthResponse = { token: tokens.issue(id), user: { id, email } };
    return res;
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof email !== 'string' || typeof password !== 'string') return reply.code(400).send({ error: 'Email and password required' });
    if (isRateLimited(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    const user = db.userByEmail(email.trim());
    if (!user || !(await verifyPassword(password, user.password_hash))) return reply.code(401).send({ error: 'Invalid email or password' });
    const res: AuthResponse = { token: tokens.issue(user.id), user: { id: user.id, email: user.email } };
    return res;
  });

  app.get('/api/me', async (req, reply) => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const user = db.userById(userId)!;
    const res: User = { id: user.id, email: user.email };
    return res;
  });
}
