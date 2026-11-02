import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';
import { db } from '../lib/db';
import { syncEngine } from '../lib/sync';
import { makeNote } from '../test/factories';

const editor = () => document.querySelector('.ProseMirror') as HTMLElement;
const menu = () => screen.queryByRole('listbox');

async function renderEditor() {
  const note = makeNote({ id: 'n', content: null });
  await db.notes.add(note);
  render(<NoteEditor note={note} focusSignal={0} />);
  const user = userEvent.setup();
  await user.click(editor());
  return user;
}

beforeEach(() => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});
});

describe('slash commands', () => {
  it('opens the block menu when typing "/"', async () => {
    const user = await renderEditor();
    await user.keyboard('/');

    await waitFor(() => expect(screen.getByText('Basic blocks')).toBeTruthy());
    expect(screen.getAllByRole('option').map((b) => b.textContent)).toContain('H1Heading 1Big section heading');
  });

  it('filters commands by title and keyword', async () => {
    const user = await renderEditor();
    await user.keyboard('/todo');

    await waitFor(() => expect(screen.getByText('To-do list')).toBeTruthy());
    expect(screen.queryByText('Heading 1')).toBeNull();
  });

  it('says when no command matches', async () => {
    const user = await renderEditor();
    await user.keyboard('/zzzz');
    await waitFor(() => expect(screen.getByText('No results')).toBeTruthy());
  });

  it('applies the selected command with the keyboard and removes the typed text', async () => {
    const user = await renderEditor();
    await user.keyboard('/head');
    await waitFor(() => expect(screen.getByText('Heading 1')).toBeTruthy());

    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(editor().querySelector('h2')).not.toBeNull());
    expect(editor().textContent).not.toContain('/head');
    expect(menu()).toBeNull();
  });

  it('applies a command on click', async () => {
    const user = await renderEditor();
    await user.keyboard('/quote');
    await waitFor(() => expect(screen.getByText('Quote')).toBeTruthy());

    await user.pointer({ keys: '[MouseLeft]', target: screen.getByText('Quote') });
    await waitFor(() => expect(editor().querySelector('blockquote')).not.toBeNull());
  });

  it('closes on Escape', async () => {
    const user = await renderEditor();
    await user.keyboard('/');
    await waitFor(() => expect(screen.getByText('Basic blocks')).toBeTruthy());

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Basic blocks')).toBeNull());
  });
});
