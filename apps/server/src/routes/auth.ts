import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthResponse, ConfigResponse, LoginResponse, User } from '@sheafly/shared';
import type { AppContext } from '../app.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { createRateLimiter } from '../auth/rate-limit.ts';
import { verifyTotp } from '../auth/totp.ts';
import { recoveryCodeMatches } from '../auth/recovery.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `/api/config`, sign-up, login (incl. the 2FA step), `/api/me` and profile updates. */
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

  app.post('/api/auth/login', async (req, reply): Promise<LoginResponse | undefined> => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof email !== 'string' || typeof password !== 'string') return reply.code(400).send({ error: 'Email and password required' });
    if (isRateLimited(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    const user = db.userByEmail(email.trim());
    if (!user || !(await verifyPassword(password, user.passwordHash))) return reply.code(401).send({ error: 'Invalid email or password' });
    // Correct password, but an authenticator code is still required to finish logging in.
    if (db.confirmedDeviceCount(user.id) > 0) return { twoFactorRequired: true, challenge: tokens.issueChallenge(user.id) };
    return { token: tokens.issue(user.id), user: { id: user.id, email: user.email } };
  });

  app.post('/api/auth/login/2fa', async (req, reply): Promise<AuthResponse | undefined> => {
    const { challenge, code } = (req.body ?? {}) as { challenge?: unknown; code?: unknown };
    if (typeof challenge !== 'string' || typeof code !== 'string') return reply.code(400).send({ error: 'A verification code is required' });
    if (isRateLimited(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    const userId = tokens.verifyChallenge(challenge);
    const user = userId ? db.userById(userId) : null;
    if (!user) return reply.code(401).send({ error: 'Your login session expired. Start again.' });

    const device = db.confirmedTwoFactorDevices(user.id).find((d) => verifyTotp(d.secret, code));
    if (device) {
      db.touchTwoFactorDevice(device.id, Date.now());
      return { token: tokens.issue(user.id), user: { id: user.id, email: user.email } };
    }
    // Fall back to a single-use recovery code.
    const recovery = db.unusedRecoveryCodes(user.id).find((r) => recoveryCodeMatches(code, r.codeHash));
    if (recovery) {
      db.consumeRecoveryCode(recovery.id, Date.now());
      return { token: tokens.issue(user.id), user: { id: user.id, email: user.email } };
    }
    return reply.code(401).send({ error: 'That code is not valid' });
  });

  app.get('/api/me', async (req, reply) => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const user = db.userById(userId)!;
    const res: User = { id: user.id, email: user.email };
    return res;
  });

  app.post('/api/me/profile', async (req, reply): Promise<User | undefined> => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const { email } = (req.body ?? {}) as { email?: unknown };
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) return reply.code(400).send({ error: 'Enter a valid email' });
    const trimmed = email.trim();
    const existing = db.userByEmail(trimmed);
    if (existing && existing.id !== userId) return reply.code(409).send({ error: 'An account with that email already exists' });
    db.updateUserEmail(userId, trimmed);
    return { id: userId, email: trimmed };
  });

  app.post('/api/me/password', async (req, reply) => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const { currentPassword, newPassword } = (req.body ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 256) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }
    const user = db.userById(userId)!;
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return reply.code(401).send({ error: 'Incorrect password' });
    }
    db.updateUserPassword(userId, await hashPassword(newPassword));
    return { ok: true };
  });
}
