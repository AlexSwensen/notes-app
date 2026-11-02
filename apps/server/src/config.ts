import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Reads all settings from environment variables. See "Configuration" in the README. */
export function loadConfig() {
  const dataDir = resolve(process.env.DATA_DIR ?? join(import.meta.dirname, '../data'));
  mkdirSync(dataDir, { recursive: true });

  return {
    dataDir,
    dbFile: join(dataDir, 'notes.db'),
    secret: process.env.AUTH_SECRET || loadOrCreateSecret(join(dataDir, 'secret.key')),
    allowSignup: (process.env.ALLOW_SIGNUP ?? 'true') !== 'false',
    staticDir: resolve(process.env.STATIC_DIR ?? join(import.meta.dirname, '../../client/dist')),
    trustProxy: process.env.TRUST_PROXY === 'true',
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    version: (JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as { version: string }).version,
  };
}

/** Generates a random signing key on first start and reuses it afterwards. */
function loadOrCreateSecret(file: string): string {
  if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString('base64url'), { mode: 0o600 });
  return readFileSync(file, 'utf8').trim();
}
