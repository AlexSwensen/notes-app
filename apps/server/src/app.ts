import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import type { Db } from '@sheafly/db';
import { createTokenService, type TokenService } from './auth/tokens.ts';
import { createSseHub, type SseHub } from './sse.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerSyncRoutes } from './routes/sync.ts';
import { registerEventRoutes } from './routes/events.ts';
import { registerStaticRoutes } from './routes/static.ts';

export interface AppOptions {
  db: Db;
  secret: string;
  allowSignup: boolean;
  staticDir?: string;
  logger?: boolean;
  trustProxy?: boolean;
  /** Reported by `/api/health`. */
  version?: string;
}

/** Everything a route module needs, created once in `buildApp`. */
export interface AppContext {
  db: Db;
  tokens: TokenService;
  sse: SseHub;
  allowSignup: boolean;
  /** Returns the user id for a valid token of an existing user, otherwise `null`. */
  userFromToken(token: string | undefined): string | null;
  /** Reads the `Authorization: Bearer` header. Sends a 401 and returns `null` if not signed in. */
  requireUser(req: FastifyRequest, reply: FastifyReply): string | null;
}

/** Creates the Fastify app. Kept separate from `index.ts` so tests can build one without listening on a port. */
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

  const sse = createSseHub();

  const userFromToken = (token: string | undefined) => {
    const userId = tokens.verify(token);
    return userId && db.userById(userId) ? userId : null;
  };

  const ctx: AppContext = {
    db,
    tokens,
    sse,
    allowSignup: opts.allowSignup,
    userFromToken,
    requireUser(req, reply) {
      const header = req.headers.authorization;
      const userId = userFromToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
      if (!userId) reply.code(401).send({ error: 'Unauthorized' });
      return userId;
    },
  };

  app.get('/api/health', async () => ({ ok: true, version: opts.version ?? 'dev' }));
  registerAuthRoutes(app, ctx);
  registerSyncRoutes(app, ctx);
  registerEventRoutes(app, ctx);
  registerStaticRoutes(app, opts.staticDir);

  // preClose, not onClose: open event streams would otherwise stop the server from closing.
  app.addHook('preClose', async () => sse.closeAll());

  return app;
}
