import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/** Serves the built client (`apps/client/dist`) and falls back to `index.html` for page URLs. */
export function registerStaticRoutes(app: FastifyInstance, staticDir: string | undefined) {
  if (!staticDir || !existsSync(staticDir)) return;

  app.register(fastifyStatic, {
    root: staticDir,
    cacheControl: false,
    setHeaders(reply: { header: (k: string, v: string) => unknown }, path: string) {
      // Vite puts content-hashed files in /assets, so they never change.
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
