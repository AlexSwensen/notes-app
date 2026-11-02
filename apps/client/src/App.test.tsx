import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { db } from './lib/db';
import { session } from './lib/api';
import { syncEngine } from './lib/sync';
import { jsonResponse, makeNote } from './test/factories';

class FakeEventSource {
  addEventListener() {}
  close() {}
}

function signIn() {
  session.set('tok', { id: 'u1', email: 'ada@example.com' });
}

function setHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ seq: 0, more: false, changes: [], allowSignup: true })));
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});
  vi.spyOn(syncEngine, 'start').mockImplementation(() => {});
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
});

describe('App', () => {
  it('shows the login screen when signed out', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });

  it('shows the workspace and starts syncing when signed in', async () => {
    signIn();
    render(<App />);

    expect(await screen.findByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('🏠 Home')).toBeTruthy();
    expect(syncEngine.start).toHaveBeenCalled();
  });

  it('routes to pages, the trash, and missing pages', async () => {
    signIn();
    await db.notes.bulkAdd([
      makeNote({ id: 'page', title: 'My page' }),
      makeNote({ id: 'gone', purged: true, trashed: true }),
    ]);
    render(<App />);

    setHash('#/p/page');
    expect(await screen.findByDisplayValue('My page')).toBeTruthy();

    setHash('#/trash');
    expect(await screen.findByRole('heading', { name: 'Trash' })).toBeTruthy();

    setHash('#/p/gone');
    expect(await screen.findByText('This page was permanently deleted.')).toBeTruthy();

    setHash('#/p/nope');
    expect(await screen.findByText('Page not found.')).toBeTruthy();
  });

  it('expands the sidebar to reveal the current page', async () => {
    signIn();
    await db.notes.bulkAdd([
      makeNote({ id: 'top', title: 'Top' }),
      makeNote({ id: 'mid', title: 'Mid', parentId: 'top' }),
      makeNote({ id: 'deep', title: 'Deep', parentId: 'mid' }),
    ]);
    window.location.hash = '#/p/deep';
    render(<App />);

    await waitFor(() => expect(screen.getAllByText('Deep').length).toBeGreaterThan(1));
    expect(JSON.parse(localStorage.getItem('notes.expanded')!).sort()).toEqual(['mid', 'top']);
  });

  it('opens search with Ctrl+K and toggles the sidebar with Ctrl+\\', async () => {
    signIn();
    render(<App />);
    await screen.findByText('ada@example.com');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
    expect(screen.queryByText('ada@example.com')).toBeNull();
    fireEvent.click(screen.getByTitle(/Open sidebar/));
    expect(screen.getByText('ada@example.com')).toBeTruthy();
  });

  it('asks before logging out with unsynced changes and stays signed in if cancelled', async () => {
    signIn();
    await db.notes.add(makeNote({ dirty: 1 }));
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1 change(s) haven't synced")));
    expect(session.token).toBe('tok');
    expect(await db.notes.count()).toBe(1);
  });

  it('clears the session when the server rejects it', async () => {
    signIn();
    render(<App />);
    await screen.findByText('ada@example.com');

    syncEngine.onUnauthorized();
    expect(session.token).toBeNull();
  });
});
