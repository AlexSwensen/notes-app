import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

const dataDir = resolve(process.env.DATA_DIR ?? join(import.meta.dirname, '../data'));
mkdirSync(dataDir, { recursive: true });

function loadSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const file = join(dataDir, 'secret.key');
  if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString('base64url'), { mode: 0o600 });
  return readFileSync(file, 'utf8').trim();
}

const app = buildApp({
  db: openDb(join(dataDir, 'notes.db')),
  secret: loadSecret(),
  allowSignup: (process.env.ALLOW_SIGNUP ?? 'true') !== 'false',
  staticDir: resolve(process.env.STATIC_DIR ?? join(import.meta.dirname, '../../client/dist')),
  logger: true,
  trustProxy: process.env.TRUST_PROXY === 'true',
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
