import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type {
  ConfirmDeviceResponse,
  EnrollDeviceResponse,
  RecoveryCodesResponse,
  TwoFactorDevice,
  TwoFactorStatus,
} from '@sheafly/shared';
import type { AppContext } from '../app.ts';
import type { TwoFactorDeviceRow } from '../db/index.ts';
import { verifyPassword } from '../auth/password.ts';
import { createRateLimiter } from '../auth/rate-limit.ts';
import { generateSecret, totpUri, verifyTotp } from '../auth/totp.ts';
import { generateRecoveryCodes, hashRecoveryCode } from '../auth/recovery.ts';

const NAME_MAX = 60;

/** Never leaks the secret: only the fields the client is allowed to see. */
function publicDevice(row: TwoFactorDeviceRow): TwoFactorDevice {
  return { id: row.id, name: row.name, confirmed: row.confirmedAt != null, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt };
}

/** Manage authenticator devices and recovery codes under `/api/2fa`. All routes need a session. */
export function registerTwoFactorRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const isRateLimited = createRateLimiter();

  app.get('/api/2fa', async (req, reply): Promise<TwoFactorStatus | undefined> => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const devices = db.confirmedTwoFactorDevices(userId).map(publicDevice);
    return { enabled: devices.length > 0, devices, recoveryCodesRemaining: db.countUnusedRecoveryCodes(userId) };
  });

  app.post('/api/2fa/devices', async (req, reply): Promise<EnrollDeviceResponse | undefined> => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const { name } = (req.body ?? {}) as { name?: unknown };
    if (typeof name !== 'string' || !name.trim() || name.length > NAME_MAX) {
      return reply.code(400).send({ error: 'Enter a device name' });
    }
    // Keep only one pending enrollment so repeated "Add device" clicks don't pile up.
    db.deleteUnconfirmedTwoFactorDevices(userId);
    const id = randomUUID();
    const secret = generateSecret();
    db.createTwoFactorDevice(id, userId, name.trim(), secret);
    const user = db.userById(userId)!;
    return { id, name: name.trim(), secret, uri: totpUri(secret, user.email) };
  });

  app.post('/api/2fa/devices/:id/confirm', async (req, reply): Promise<ConfirmDeviceResponse | undefined> => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    if (isRateLimited(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again later' });
    const { id } = req.params as { id: string };
    const { code } = (req.body ?? {}) as { code?: unknown };
    const device = db.twoFactorDeviceById(id);
    if (!device || device.userId !== userId) return reply.code(404).send({ error: 'Device not found' });
    if (typeof code !== 'string' || !verifyTotp(device.secret, code)) {
      return reply.code(400).send({ error: 'That code is not valid. Check your authenticator and try again.' });
    }
    const wasEnabled = db.confirmedDeviceCount(userId) > 0;
    db.confirmTwoFactorDevice(id, Date.now());
    // Only mint recovery codes the first time two-factor is switched on.
    if (wasEnabled) return { confirmed: true };
    const recoveryCodes = generateRecoveryCodes();
    db.replaceRecoveryCodes(userId, recoveryCodes.map(hashRecoveryCode));
    return { confirmed: true, recoveryCodes };
  });

  app.post('/api/2fa/devices/:id/delete', async (req, reply) => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const device = db.twoFactorDeviceById(id);
    if (!device || device.userId !== userId) return reply.code(404).send({ error: 'Device not found' });
    db.deleteTwoFactorDevice(id);
    // Turning off the last device disables two-factor, so stale recovery codes must go too.
    if (db.confirmedDeviceCount(userId) === 0) db.deleteRecoveryCodes(userId);
    return { ok: true };
  });

  app.post('/api/2fa/recovery-codes', async (req, reply): Promise<RecoveryCodesResponse | undefined> => {
    const userId = ctx.requireUser(req, reply);
    if (!userId) return;
    const { password } = (req.body ?? {}) as { password?: unknown };
    if (db.confirmedDeviceCount(userId) === 0) return reply.code(400).send({ error: 'Enable two-factor authentication first' });
    const user = db.userById(userId)!;
    if (typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Incorrect password' });
    }
    const recoveryCodes = generateRecoveryCodes();
    db.replaceRecoveryCodes(userId, recoveryCodes.map(hashRecoveryCode));
    return { recoveryCodes };
  });
}
