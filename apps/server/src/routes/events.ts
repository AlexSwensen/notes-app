import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app.ts';

/**
 * `GET /api/events`: a Server-Sent Events stream that tells the browser when to sync.
 * `EventSource` can't send headers, so the token comes in the query string.
 */
export function registerEventRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/events', (req, reply) => {
    const q = req.query as { token?: string; clientId?: string };
    const userId = ctx.userFromToken(q.token);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    // Take over the raw response: Fastify must not end it.
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\n\n`);
    const remove = ctx.sse.add(userId, { res, clientId: String(q.clientId ?? '') });
    // Keeps proxies from closing an idle connection.
    const ping = setInterval(() => res.write(`: ping\n\n`), 25000);
    req.raw.on('close', () => {
      clearInterval(ping);
      remove();
    });
  });
}
