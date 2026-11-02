// Entry point: read config, open the database, start the HTTP server.
import { loadConfig } from './config.ts';
import { openDb } from './db/index.ts';
import { buildApp } from './app.ts';

const config = loadConfig();

const app = buildApp({
  db: openDb(config.dbFile),
  secret: config.secret,
  allowSignup: config.allowSignup,
  staticDir: config.staticDir,
  logger: true,
  trustProxy: config.trustProxy,
  version: config.version,
});

await app.listen({ port: config.port, host: config.host });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
