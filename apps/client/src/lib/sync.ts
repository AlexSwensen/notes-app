import type { SyncRequest, SyncResponse } from '@sheafly/shared';
import { db, getMeta, setMeta, stripLocal, type Note } from './db';
import { api, ApiError, session } from './api';
import { uuid } from './uuid';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

const BATCH = 200;

function getClientId(): string {
  let id = sessionStorage.getItem('notes.clientId');
  if (!id) {
    id = uuid();
    sessionStorage.setItem('notes.clientId', id);
  }
  return id;
}

class SyncEngine {
  status: SyncStatus = navigator.onLine ? 'idle' : 'offline';
  lastSyncedAt: number | null = null;
  error: string | null = null;
  private listeners = new Set<() => void>();
  private running = false;
  private queued = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private events: EventSource | null = null;
  private interval: ReturnType<typeof setInterval> | undefined;
  onUnauthorized: () => void = () => {};
  readonly clientId = getClientId();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private setStatus(status: SyncStatus, error: string | null = null) {
    this.status = status;
    this.error = error;
    this.listeners.forEach((fn) => fn());
  }

  /** Debounced sync, used after local edits. */
  schedule(delay = 800) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), delay);
  }

  async sync(): Promise<void> {
    if (!session.token) return;
    if (this.running) {
      this.queued = true;
      return;
    }
    if (!navigator.onLine) return this.setStatus('offline');
    this.running = true;
    this.setStatus('syncing');
    try {
      let more = true;
      while (more) more = await this.syncOnce();
      this.lastSyncedAt = Date.now();
      this.setStatus('idle');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        this.setStatus('error', 'Session expired');
        this.onUnauthorized();
      } else if (e instanceof TypeError || !navigator.onLine) {
        this.setStatus('offline');
      } else {
        this.setStatus('error', e instanceof Error ? e.message : String(e));
      }
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        this.schedule(50);
      }
    }
  }

  private async syncOnce(): Promise<boolean> {
    const since = (await getMeta<number>('seq')) ?? 0;
    const dirty = await db.notes.where('dirty').equals(1).limit(BATCH).toArray();
    const req: SyncRequest<Note['content']> = { since, clientId: this.clientId, changes: dirty.map(stripLocal) };
    const res = await api<SyncResponse<Note['content']>>('/api/sync', req);
    await db.transaction('rw', db.notes, db.meta, async () => {
      for (const sent of dirty) {
        const cur = await db.notes.get(sent.id);
        // Only clear the flag if it wasn't edited again while the request was in flight.
        if (cur && cur.updatedAt === sent.updatedAt) await db.notes.update(sent.id, { dirty: 0 });
      }
      for (const remote of res.changes) {
        const cur = await db.notes.get(remote.id);
        if (cur?.dirty && cur.updatedAt > remote.updatedAt) continue;
        await db.notes.put({ ...remote, dirty: 0 });
      }
      await setMeta('seq', res.seq);
    });
    return res.more || dirty.length === BATCH;
  }

  start() {
    this.stop();
    this.sync();
    const token = session.token;
    if (token) {
      this.events = new EventSource(`/api/events?token=${encodeURIComponent(token)}&clientId=${this.clientId}`);
      this.events.addEventListener('change', () => this.schedule(100));
      this.events.addEventListener('open', () => this.schedule(100));
    }
    this.interval = setInterval(() => this.sync(), 60_000);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    document.addEventListener('visibilitychange', this.handleVisible);
  }

  stop() {
    this.events?.close();
    this.events = null;
    clearInterval(this.interval);
    clearTimeout(this.timer);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisible);
  }

  private handleOnline = () => this.sync();
  private handleOffline = () => this.setStatus('offline');
  private handleVisible = () => {
    if (document.visibilityState === 'visible') this.sync();
  };
}

export const syncEngine = new SyncEngine();
