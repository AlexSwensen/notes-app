import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import { createSseHub } from '../src/sse.ts';
import { makeApp, note, signup, sync } from './helpers.ts';

function fakeStream(clientId: string) {
  const writes: string[] = [];
  let ended = false;
  const res = { write: (s: string) => writes.push(s), end: () => (ended = true) } as unknown as ServerResponse;
  return { stream: { res, clientId }, writes, ended: () => ended };
}

describe('SSE hub', () => {
  it("notifies the user's other clients, not the one that made the change", () => {
    const hub = createSseHub();
    const origin = fakeStream('tab-1');
    const other = fakeStream('tab-2');
    const stranger = fakeStream('tab-3');
    hub.add('u1', origin.stream);
    hub.add('u1', other.stream);
    hub.add('u2', stranger.stream);

    hub.broadcast('u1', 'tab-1', 42);

    assert.deepEqual(origin.writes, []);
    assert.deepEqual(other.writes, ['event: change\ndata: {"seq":42}\n\n']);
    assert.deepEqual(stranger.writes, []);
  });

  it('stops notifying removed streams', () => {
    const hub = createSseHub();
    const s = fakeStream('tab');
    const remove = hub.add('u1', s.stream);
    remove();
    hub.broadcast('u1', 'other', 1);
    assert.deepEqual(s.writes, []);
  });

  it('ignores broadcasts for users without streams', () => {
    assert.doesNotThrow(() => createSseHub().broadcast('nobody', 'x', 1));
  });

  it('closes every stream on shutdown', () => {
    const hub = createSseHub();
    const a = fakeStream('a');
    const b = fakeStream('b');
    hub.add('u1', a.stream);
    hub.add('u2', b.stream);
    hub.closeAll();
    assert.equal(a.ended(), true);
    assert.equal(b.ended(), true);
  });
});

/** Opens an SSE connection and collects decoded chunks until `until` matches. */
async function openStream(base: string, token: string, clientId: string) {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events?token=${encodeURIComponent(token)}&clientId=${clientId}`, { signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let received = '';
  return {
    res,
    async waitFor(pattern: RegExp, timeoutMs = 2000) {
      const deadline = Date.now() + timeoutMs;
      while (!pattern.test(received)) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${pattern}; got ${JSON.stringify(received)}`);
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), deadline - Date.now())),
        ]);
        if (done && !value) continue;
        received += decoder.decode(value);
      }
      return received;
    },
    get received() {
      return received;
    },
    close: () => controller.abort(),
  };
}

describe('GET /api/events', () => {
  it('rejects missing or invalid tokens', async () => {
    const app = makeApp();
    assert.equal((await app.inject({ url: '/api/events' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/events?token=bad.token' })).statusCode, 401);
  });

  it('streams change events to other devices of the same user', async (t) => {
    const app = makeApp();
    const token = await signup(app);
    const otherToken = await signup(app, 'b@example.com');
    const base = await app.listen({ port: 0, host: '127.0.0.1' });
    t.after(() => app.close());

    const mine = await openStream(base, token, 'tab-1');
    const theirs = await openStream(base, otherToken, 'tab-9');
    t.after(() => { mine.close(); theirs.close(); });

    assert.equal(mine.res.status, 200);
    assert.equal(mine.res.headers.get('content-type'), 'text/event-stream');
    assert.equal(mine.res.headers.get('cache-control'), 'no-cache, no-transform');
    await mine.waitFor(/retry: 3000/);

    await sync(app, token, { since: 0, clientId: 'tab-2', changes: [note('a', 1)] });
    await mine.waitFor(/event: change\ndata: \{"seq":1\}/);

    // Pulls without changes and the originating tab don't trigger events.
    await sync(app, token, { since: 0, clientId: 'tab-2', changes: [] });
    await sync(app, token, { since: 0, clientId: 'tab-1', changes: [note('b', 1)] });
    await sync(app, token, { since: 0, clientId: 'tab-2', changes: [note('c', 1)] });
    const all = await mine.waitFor(/"seq":3/);
    assert.equal(all.match(/event: change/g)!.length, 2);
    assert.doesNotMatch(theirs.received, /event: change/);
  });
});
