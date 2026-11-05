import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { DatabaseError } from './DatabaseError';
import { db } from '../lib/db';
import { makeNote } from '../test/factories';

afterEach(async () => {
  vi.restoreAllMocks();
  if (!db.isOpen()) await db.open();
});

describe('DatabaseError', () => {
  it('shows the underlying error', () => {
    render(<DatabaseError error={new Error('UnknownError: Internal error.')} />);
    expect(screen.getByRole('heading', { name: "Can't open local storage" })).toBeTruthy();
    expect(screen.getByText('UnknownError: Internal error.')).toBeTruthy();
  });

  it('deletes the local database when reset', async () => {
    await db.notes.add(makeNote());
    const del = vi.spyOn(Dexie, 'delete');
    render(<DatabaseError error="boom" />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset local data' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('notes-app'));
    await db.open();
    expect(await db.notes.count()).toBe(0);
  });

  it('suggests clearing site data when the reset fails', async () => {
    vi.spyOn(Dexie, 'delete').mockRejectedValue(new Error('still broken'));
    render(<DatabaseError error="boom" />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset local data' }));
    expect((await screen.findByRole('alert')).textContent).toContain("Clear this site's data");
    expect(
      (screen.getByRole('button', { name: 'Reset local data' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
