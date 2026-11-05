import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trash } from './Trash';
import { db, type LocalNote } from '../lib/db';
import { syncEngine } from '../lib/sync';
import { makeNote } from '../test/factories';

async function renderTrash(notes: LocalNote[]) {
  await db.notes.bulkAdd(notes);
  const onNavigate = vi.fn();
  render(
    <Trash notes={notes} byId={new Map(notes.map((n) => [n.id, n]))} onNavigate={onNavigate} />,
  );
  return { onNavigate };
}

beforeEach(() => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});
});

describe('Trash', () => {
  it('says when the trash is empty', async () => {
    await renderTrash([makeNote({ title: 'Live' })]);
    expect(screen.getByText('Trash is empty.')).toBeTruthy();
  });

  it('lists only the top of each trashed subtree, newest first', async () => {
    await renderTrash([
      makeNote({ id: 'old', title: 'Old', trashed: true, updatedAt: 1 }),
      makeNote({ id: 'parent', title: 'Parent', trashed: true, updatedAt: 5 }),
      makeNote({ title: 'Nested', parentId: 'parent', trashed: true, updatedAt: 5 }),
      makeNote({ title: 'Gone', trashed: true, purged: true }),
      makeNote({ title: 'Live' }),
    ]);

    expect(screen.getByText('2 pages')).toBeTruthy();
    const titles = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(titles[0]).toContain('Parent');
    expect(titles[1]).toContain('Old');
    expect(screen.queryByText('Nested')).toBeNull();
  });

  it('shows a trashed child when its parent is live', async () => {
    await renderTrash([
      makeNote({ id: 'p', title: 'Parent' }),
      makeNote({ title: 'Child', parentId: 'p', trashed: true }),
    ]);
    expect(screen.getByText('1 page')).toBeTruthy();
    expect(screen.getByText('Child', { exact: false })).toBeTruthy();
  });

  it('opens and restores a page', async () => {
    const { onNavigate } = await renderTrash([
      makeNote({ id: 'n', title: 'Restore me', trashed: true }),
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByText('Restore me', { exact: false }));
    expect(onNavigate).toHaveBeenCalledWith('#/p/n');

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect((await db.notes.get('n'))!.trashed).toBe(false));
  });

  it('only deletes forever after confirmation', async () => {
    await renderTrash([makeNote({ id: 'n', title: 'Doomed', trashed: true })]);
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirm);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Delete forever' }));
    expect((await db.notes.get('n'))!.purged).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Delete forever' }));
    expect(confirm).toHaveBeenLastCalledWith('Permanently delete "Doomed"?');
    await waitFor(async () => expect((await db.notes.get('n'))!.purged).toBe(true));
  });

  it('empties the whole trash after confirmation', async () => {
    await renderTrash([
      makeNote({ id: 'a', trashed: true }),
      makeNote({ id: 'b', trashed: true }),
      makeNote({ id: 'live' }),
    ]);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Empty trash' }));
    await waitFor(async () => {
      const purged = (await db.notes.toArray()).filter((n) => n.purged).map((n) => n.id);
      expect(purged.sort()).toEqual(['a', 'b']);
    });
  });
});
