import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchPalette } from './SearchPalette';
import { db, type LocalNote } from '../lib/db';
import { searchIndex } from '../lib/search';
import { syncEngine } from '../lib/sync';
import { makeNote } from '../test/factories';

function renderPalette(notes: LocalNote[]) {
  searchIndex.update(notes);
  const onNavigate = vi.fn();
  const onClose = vi.fn();
  render(<SearchPalette notes={notes} byId={new Map(notes.map((n) => [n.id, n]))} onNavigate={onNavigate} onClose={onClose} />);
  return { onNavigate, onClose, input: screen.getByPlaceholderText('Search your notes…') };
}

const options = () => screen.queryAllByRole('option');
const selected = () => options().find((o) => o.getAttribute('aria-selected') === 'true');

beforeEach(() => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});
});

describe('SearchPalette', () => {
  it('lists recently edited live pages when the query is empty', () => {
    renderPalette([
      makeNote({ title: 'Older', updatedAt: 1 }),
      makeNote({ title: 'Newest', updatedAt: 3 }),
      makeNote({ title: 'Binned', updatedAt: 2, trashed: true }),
    ]);

    expect(screen.getByText('Recent')).toBeTruthy();
    expect(options().map((o) => o.textContent)).toEqual(['📄Newest', '📄Older']);
    expect(screen.getByText('2 pages indexed')).toBeTruthy();
  });

  it('shows matches with their parent path and a highlighted snippet', async () => {
    const parent = makeNote({ id: 'p', title: 'Work' });
    const child = makeNote({ parentId: 'p', title: 'Roadmap', text: 'Ship the roadmap by Q3' });
    const { input } = renderPalette([parent, child]);

    await userEvent.type(input, 'roadmap');

    const first = options()[0];
    expect(within(first).getByText('— Work', { exact: false })).toBeTruthy();
    expect(first.querySelectorAll('mark').length).toBeGreaterThan(0);
    expect(options().at(-1)!.textContent).toContain('New page “roadmap”');
  });

  it('says when nothing matches', async () => {
    const { input } = renderPalette([makeNote({ title: 'Groceries' })]);
    await userEvent.type(input, 'zzzz');
    expect(screen.getByText('No results for “zzzz”')).toBeTruthy();
  });

  it('opens the selected result with Enter', async () => {
    const note = makeNote({ title: 'Budget' });
    const { input, onNavigate, onClose } = renderPalette([note]);

    await userEvent.type(input, 'budget{Enter}');
    expect(onNavigate).toHaveBeenCalledWith(`#/p/${note.id}`);
    expect(onClose).toHaveBeenCalled();
  });

  it('moves the selection with the arrow keys and wraps around', async () => {
    const { input } = renderPalette([makeNote({ title: 'A', updatedAt: 2 }), makeNote({ title: 'B', updatedAt: 1 })]);
    expect(selected()!.textContent).toContain('A');

    await userEvent.type(input, '{ArrowDown}');
    expect(selected()!.textContent).toContain('B');
    await userEvent.type(input, '{ArrowDown}');
    expect(selected()!.textContent).toContain('A');
    await userEvent.type(input, '{ArrowUp}');
    expect(selected()!.textContent).toContain('B');
  });

  it('creates a page from the query', async () => {
    const { input, onNavigate } = renderPalette([]);

    await userEvent.type(input, 'Trip ideas{Enter}');
    await waitFor(() => expect(onNavigate).toHaveBeenCalled());
    const created = await db.notes.toArray();
    expect(created).toHaveLength(1);
    expect(created[0].title).toBe('Trip ideas');
    expect(onNavigate).toHaveBeenCalledWith(`#/p/${created[0].id}`);
  });

  it('opens a result on click', async () => {
    const note = makeNote({ title: 'Clickable' });
    const { onNavigate } = renderPalette([note]);

    await userEvent.click(screen.getByText('Clickable'));
    expect(onNavigate).toHaveBeenCalledWith(`#/p/${note.id}`);
  });

  it('closes on Escape and on backdrop click, but not on clicks inside', async () => {
    const { input, onClose } = renderPalette([]);

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
    await userEvent.type(input, '{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
