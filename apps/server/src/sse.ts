import type { ServerResponse } from 'node:http';

interface Stream {
  res: ServerResponse;
  clientId: string;
}

/**
 * Keeps track of open Server-Sent Events connections, per user, so the server
 * can tell a user's other devices "something changed, please sync".
 */
export function createSseHub() {
  const streams = new Map<string, Set<Stream>>();

  return {
    /** Registers a stream and returns a function that unregisters it. */
    add(userId: string, stream: Stream): () => void {
      if (!streams.has(userId)) streams.set(userId, new Set());
      streams.get(userId)!.add(stream);
      return () => streams.get(userId)?.delete(stream);
    },

    /** Notifies all of a user's streams except the one that made the change. */
    broadcast(userId: string, originClientId: string, seq: number) {
      for (const s of streams.get(userId) ?? []) {
        if (s.clientId === originClientId) continue;
        s.res.write(`event: change\ndata: ${JSON.stringify({ seq })}\n\n`);
      }
    },

    closeAll() {
      for (const set of streams.values()) for (const s of set) s.res.end();
    },
  };
}

export type SseHub = ReturnType<typeof createSseHub>;
