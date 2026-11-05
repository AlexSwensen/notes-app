import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageView } from './PageView';
import { db, type LocalNote } from '../lib/db';
import { syncEngine } from '../lib/sync';
import { makeNote } from '../test/factories';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function renderPage(note: LocalNote, others: LocalNote[] = [], subpages: LocalNote[] = []) {
  await db.notes.bulkAdd([note, ...others, ...subpages]);
  const all = [note, ...others, ...subpages];
  const onNavigate = vi.fn();
  const view = render(
    <PageView
      note={note}
      byId={new Map(all.map((n) => [n.id, n]))}
      subpages={subpages}
      onNavigate={onNavigate}
    />,
  );
  return { ...view, onNavigate };
}

const title = () => screen.getByPlaceholderText('Untitled') as HTMLTextAreaElement;
const editor = () => document.querySelector('.ProseMirror') as HTMLElement;

beforeEach(() => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});
});

describe('PageView', () => {
  it('renders breadcrumbs for every ancestor', async () => {
    const grand = makeNote({ id: 'g', title: 'Work', icon: '💼' });
    const parent = makeNote({ id: 'p', title: 'Projects', parentId: 'g' });
    const { onNavigate } = await renderPage(makeNote({ title: 'Roadmap', parentId: 'p' }), [
      grand,
      parent,
    ]);

    await userEvent.click(screen.getByRole('button', { name: '💼 Work' }));
    expect(onNavigate).toHaveBeenCalledWith('#/p/g');
    expect(screen.getByRole('button', { name: 'Projects' })).toBeTruthy();
  });

  it('saves title edits and strips newlines', async () => {
    const note = makeNote({ id: 'n', title: '' });
    await renderPage(note);

    fireEvent.change(title(), { target: { value: 'New\ntitle' } });
    expect(title().value).toBe('Newtitle');
    await waitFor(async () => expect((await db.notes.get('n'))!.title).toBe('Newtitle'));
  });

  it('focuses the empty title of a brand-new page', async () => {
    await renderPage(makeNote({ title: '', text: '' }));
    expect(document.activeElement).toBe(title());
  });

  it('moves focus into the editor when pressing Enter in the title', async () => {
    await renderPage(makeNote({ title: 'Has title' }));
    title().focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(editor().contains(document.activeElement) || document.activeElement === editor()).toBe(
        true,
      ),
    );
  });

  it('renders the stored document in the editor', async () => {
    await renderPage(makeNote({ content: doc('Hello from the editor') }));
    expect(editor().textContent).toBe('Hello from the editor');
  });

  it('applies content that arrives from another device', async () => {
    const note = makeNote({ id: 'n', content: doc('Before') });
    const { rerender } = await renderPage(note);

    const updated = { ...note, content: doc('After sync'), updatedAt: note.updatedAt + 1 };
    rerender(
      <PageView
        note={updated}
        byId={new Map([[note.id, updated]])}
        subpages={[]}
        onNavigate={() => {}}
      />,
    );
    await waitFor(() => expect(editor().textContent).toBe('After sync'));
  });

  it('saves editor changes after a short pause', async () => {
    await renderPage(makeNote({ id: 'n', content: doc('Start') }));

    act(() => {
      editor().focus();
    });
    await userEvent.type(editor(), ' typed');
    await waitFor(async () => expect((await db.notes.get('n'))!.text).toContain('typed'), {
      timeout: 2000,
    });
    expect((await db.notes.get('n'))!.dirty).toBe(1);
  });

  it('toggles favorite and moves the page to the trash', async () => {
    const { onNavigate } = await renderPage(makeNote({ id: 'n' }));
    const user = userEvent.setup();

    await user.click(screen.getByTitle('Add to favorites'));
    await waitFor(async () => expect((await db.notes.get('n'))!.favorite).toBe(true));

    await user.click(screen.getByTitle('Move to trash'));
    await waitFor(async () => expect((await db.notes.get('n'))!.trashed).toBe(true));
    expect(onNavigate).toHaveBeenCalledWith('#/');
  });

  it('shows a read-only banner for trashed pages and restores them', async () => {
    await renderPage(makeNote({ id: 'n', trashed: true }));

    expect(screen.getByText('This page is in the trash.')).toBeTruthy();
    expect(title().readOnly).toBe(true);
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(screen.queryByTitle('Move to trash')).toBeNull();
    expect(screen.queryByText('+ Add a sub-page')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect((await db.notes.get('n'))!.trashed).toBe(false));
  });

  it('picks and changes the page icon', async () => {
    await renderPage(makeNote({ id: 'n', icon: '' }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Add icon/ }));
    await user.click(screen.getByRole('button', { name: '🔥' }));
    await waitFor(async () => expect((await db.notes.get('n'))!.icon).toBe('🔥'));
    expect(screen.queryByText('Pick an icon')).toBeNull();
  });

  it('lists sub-pages and creates new ones', async () => {
    const parent = makeNote({ id: 'p' });
    const child = makeNote({ id: 'c', title: 'Child page', parentId: 'p' });
    const { onNavigate } = await renderPage(parent, [], [child]);
    const user = userEvent.setup();

    await user.click(screen.getByText('Child page'));
    expect(onNavigate).toHaveBeenCalledWith('#/p/c');

    await user.click(screen.getByText('+ Add a sub-page'));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(2));
    const created = (await db.notes.toArray()).find((n) => !['p', 'c'].includes(n.id))!;
    expect(created.parentId).toBe('p');
  });
});
