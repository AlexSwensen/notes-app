import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home } from './Home';
import { db } from '../lib/db';
import { syncEngine } from '../lib/sync';
import { makeNote } from '../test/factories';

beforeEach(() => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});
});

describe('Home', () => {
  it.each([
    [9, 'Good morning'],
    [14, 'Good afternoon'],
    [21, 'Good evening'],
  ])('greets by time of day (%i:00)', (hour, greeting) => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(hour);
    render(<Home notes={[]} onNavigate={() => {}} onSearch={() => {}} />);
    expect(screen.getByRole('heading', { name: greeting })).toBeTruthy();
  });

  it('shows up to 12 recent live pages, newest first', () => {
    const notes = [
      ...Array.from({ length: 14 }, (_, i) => makeNote({ title: `Page ${i}`, updatedAt: i })),
      makeNote({ title: 'Trashed', trashed: true, updatedAt: 999 }),
    ];
    render(<Home notes={notes} onNavigate={() => {}} onSearch={() => {}} />);

    const cards = screen.getAllByText(/^Page \d+$/).map((el) => el.textContent);
    expect(cards).toHaveLength(12);
    expect(cards[0]).toBe('Page 13');
    expect(screen.queryByText('Trashed')).toBeNull();
    expect(screen.getByRole('button', { name: /Search 14 pages/ })).toBeTruthy();
  });

  it('opens search and pages', async () => {
    const note = makeNote({ title: 'Open me' });
    const onNavigate = vi.fn();
    const onSearch = vi.fn();
    render(<Home notes={[note]} onNavigate={onNavigate} onSearch={onSearch} />);

    await userEvent.click(screen.getByRole('button', { name: /Search 1 pages/ }));
    expect(onSearch).toHaveBeenCalled();
    await userEvent.click(screen.getByText('Open me'));
    expect(onNavigate).toHaveBeenCalledWith(`#/p/${note.id}`);
  });

  it('creates a new page and opens it', async () => {
    const onNavigate = vi.fn();
    render(<Home notes={[]} onNavigate={onNavigate} onSearch={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /New page/ }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalled());
    const [created] = await db.notes.toArray();
    expect(onNavigate).toHaveBeenCalledWith(`#/p/${created.id}`);
  });
});
