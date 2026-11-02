import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncRequest } from '@notes/shared';
import { db, getMeta, setMeta } from './db';
import { session } from './api';
import { syncEngine } from './sync';
import { jsonResponse, makeNote } from '../test/factories';

type Handler = (req: SyncRequest) => Response | Promise<Response>;

/** Routes `/api/sync` calls to `handler` and records every request body. */
function mockServer(handler: Handler) {
  const requests: SyncRequest[] = [];
  const fetchMock = vi.fn(async (_path: string, init: RequestInit) => {
    const req = JSON.parse(init.body as string) as SyncRequest;
    requests.push(req);
    return handler(req);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests, fetchMock };
}

const empty = (seq = 0) => jsonResponse({ seq, more: false, changes: [] });

beforeEach(() => {
  session.set('token', { id: 'u1', email: 'a@example.com' });
  syncEngine.onUnauthorized = () => {};
});

afterEach(() => {
  syncEngine.stop();
});

describe('syncEngine.sync', () => {
  it('does nothing when signed out', async () => {
    session.clear();
    const { fetchMock } = mockServer(() => empty());

    await syncEngine.sync();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('goes offline without calling the server when the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { fetchMock } = mockServer(() => empty());

    await syncEngine.sync();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(syncEngine.status).toBe('offline');
  });

  it('pushes dirty notes without the local flag, then marks them clean', async () => {
    const dirty = makeNote({ id: 'dirty', dirty: 1 });
    await db.notes.bulkAdd([dirty, makeNote({ id: 'clean' })]);
    await setMeta('seq', 7);
    const { requests } = mockServer(() => empty(8));

    await syncEngine.sync();

    expect(requests).toHaveLength(1);
    expect(requests[0].since).toBe(7);
    expect(requests[0].clientId).toBe(syncEngine.clientId);
    expect(requests[0].changes.map((n) => n.id)).toEqual(['dirty']);
    expect(requests[0].changes[0]).not.toHaveProperty('dirty');
    expect((await db.notes.get('dirty'))!.dirty).toBe(0);
    expect(await getMeta('seq')).toBe(8);
    expect(syncEngine.status).toBe('idle');
    expect(syncEngine.lastSyncedAt).not.toBeNull();
  });

  it('stores notes pulled from the server', async () => {
    const remote = makeNote({ id: 'remote', title: 'From another device' });
    const { dirty: _dirty, ...wire } = remote;
    mockServer(() => jsonResponse({ seq: 3, more: false, changes: [wire] }));

    await syncEngine.sync();
    expect(await db.notes.get('remote')).toMatchObject({ title: 'From another device', dirty: 0 });
  });

  it('keeps the dirty flag if the note was edited while the request was in flight', async () => {
    await db.notes.add(makeNote({ id: 'n', dirty: 1, updatedAt: 100 }));
    mockServer(async () => {
      await db.notes.update('n', { title: 'edited mid-sync', updatedAt: 200 });
      return empty(1);
    });
    const next = vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});

    await syncEngine.sync();
    expect(await db.notes.get('n')).toMatchObject({ title: 'edited mid-sync', dirty: 1 });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not let an older remote copy overwrite a newer local edit', async () => {
    await db.notes.add(makeNote({ id: 'n', title: 'local', dirty: 1, updatedAt: 500 }));
    mockServer(async () => {
      await db.notes.update('n', { updatedAt: 600 });
      const { dirty: _dirty, ...remote } = makeNote({ id: 'n', title: 'remote', updatedAt: 550 });
      return jsonResponse({ seq: 2, more: false, changes: [remote] });
    });

    await syncEngine.sync();
    expect((await db.notes.get('n'))!.title).toBe('local');
  });

  it('keeps pulling while the server reports more pages', async () => {
    const pages = [
      { seq: 500, more: true, changes: [] },
      { seq: 600, more: false, changes: [] },
    ];
    const { requests } = mockServer(() => jsonResponse(pages.shift()));

    await syncEngine.sync();
    expect(requests.map((r) => r.since)).toEqual([0, 500]);
    expect(await getMeta('seq')).toBe(600);
  });

  it('pushes large backlogs in batches of 200', async () => {
    await db.notes.bulkAdd(Array.from({ length: 250 }, (_, i) => makeNote({ id: `n${i}`, dirty: 1 })));
    const { requests } = mockServer(() => empty());

    await syncEngine.sync();
    expect(requests.map((r) => r.changes.length)).toEqual([200, 50]);
    expect(await db.notes.where('dirty').equals(1).count()).toBe(0);
  });

  it('reports an expired session and calls onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    syncEngine.onUnauthorized = onUnauthorized;
    mockServer(() => jsonResponse({ error: 'Unauthorized' }, 401));

    await syncEngine.sync();
    expect(syncEngine.status).toBe('error');
    expect(syncEngine.error).toBe('Session expired');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('goes offline on network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await syncEngine.sync();
    expect(syncEngine.status).toBe('offline');
  });

  it('surfaces server errors', async () => {
    mockServer(() => jsonResponse({ error: 'Invalid note in changes' }, 400));

    await syncEngine.sync();
    expect(syncEngine.status).toBe('error');
    expect(syncEngine.error).toBe('Invalid note in changes');
  });

  it('notifies subscribers of status changes until they unsubscribe', async () => {
    mockServer(() => empty());
    const seen: string[] = [];
    const unsubscribe = syncEngine.subscribe(() => seen.push(syncEngine.status));

    await syncEngine.sync();
    expect(seen).toEqual(['syncing', 'idle']);

    unsubscribe();
    await syncEngine.sync();
    expect(seen).toHaveLength(2);
  });

  it('queues a follow-up sync when called while already syncing', async () => {
    let release!: () => void;
    const { fetchMock } = mockServer(() => new Promise((resolve) => (release = () => resolve(empty()))));
    const next = vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});

    const first = syncEngine.sync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await syncEngine.sync();
    release();
    await first;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(50);
  });
});

describe('syncEngine.schedule', () => {
  it('debounces bursts of edits into one sync', () => {
    vi.useFakeTimers();
    const sync = vi.spyOn(syncEngine, 'sync').mockResolvedValue();

    syncEngine.schedule();
    syncEngine.schedule();
    vi.advanceTimersByTime(799);
    expect(sync).not.toHaveBeenCalled();
    syncEngine.schedule(100);
    vi.advanceTimersByTime(100);
    expect(sync).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('syncEngine.start / stop', () => {
  class FakeEventSource {
    static last: FakeEventSource;
    url: string;
    listeners = new Map<string, () => void>();
    closed = false;
    constructor(url: string) {
      this.url = url;
      FakeEventSource.last = this;
    }
    addEventListener(type: string, fn: () => void) {
      this.listeners.set(type, fn);
    }
    close() {
      this.closed = true;
    }
  }

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  it('syncs immediately and subscribes to server events with the token', () => {
    const sync = vi.spyOn(syncEngine, 'sync').mockResolvedValue();

    syncEngine.start();
    expect(sync).toHaveBeenCalledOnce();
    expect(FakeEventSource.last.url).toBe(`/api/events?token=token&clientId=${syncEngine.clientId}`);
  });

  it('schedules a sync when the server announces a change', () => {
    vi.spyOn(syncEngine, 'sync').mockResolvedValue();
    const schedule = vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});

    syncEngine.start();
    FakeEventSource.last.listeners.get('change')!();
    expect(schedule).toHaveBeenCalledWith(100);
  });

  it('syncs when the browser comes back online and reports going offline', () => {
    const sync = vi.spyOn(syncEngine, 'sync').mockResolvedValue();
    syncEngine.start();
    sync.mockClear();

    window.dispatchEvent(new Event('online'));
    expect(sync).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('offline'));
    expect(syncEngine.status).toBe('offline');
  });

  it('stop closes the event stream and removes listeners', () => {
    const sync = vi.spyOn(syncEngine, 'sync').mockResolvedValue();
    syncEngine.start();
    const events = FakeEventSource.last;
    syncEngine.stop();
    sync.mockClear();

    expect(events.closed).toBe(true);
    window.dispatchEvent(new Event('online'));
    expect(sync).not.toHaveBeenCalled();
  });
});
