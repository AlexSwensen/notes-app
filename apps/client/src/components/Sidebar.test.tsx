import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { Sidebar } from './Sidebar';
import { db, type LocalNote } from '../lib/db';
import { syncEngine } from '../lib/sync';
import { useNoteTree } from '../hooks/useNoteTree';
import { makeNote } from '../test/factories';

type Overrides = Partial<ComponentProps<typeof Sidebar>>;

/** Renders the sidebar the way App does, with live expand state. */
function Harness({
  notes,
  initiallyExpanded = [],
  ...overrides
}: { notes: LocalNote[]; initiallyExpanded?: string[] } & Overrides) {
  const { tree, favorites, dirtyCount } = useNoteTree(notes);
  const [expanded, setExpandedState] = useState(new Set(initiallyExpanded));
  return (
    <Sidebar
      tree={tree}
      favorites={favorites}
      currentId={null}
      route="home"
      user={{ id: 'u1', email: 'ada@example.com' }}
      dirtyCount={dirtyCount}
      theme="light"
      onToggleTheme={() => {}}
      onNavigate={() => {}}
      onSearch={() => {}}
      onLogout={() => {}}
      onClose={() => {}}
      expanded={expanded}
      setExpanded={(fn) => setExpandedState(fn)}
      {...overrides}
    />
  );
}

async function renderSidebar(
  notes: LocalNote[],
  props: Overrides & { initiallyExpanded?: string[] } = {},
) {
  await db.notes.bulkAdd(notes);
  return render(<Harness notes={notes} {...props} />);
}

const row = (title: string) => screen.getByText(title).closest('[draggable]') as HTMLElement;

beforeEach(() => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {});
});

describe('Sidebar', () => {
  it('shows the account and top-level pages', async () => {
    await renderSidebar([makeNote({ title: 'Alpha' }), makeNote({ title: 'Beta' })]);

    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.queryByText('Favorites')).toBeNull();
  });

  it('says when there are no pages yet', async () => {
    await renderSidebar([]);
    expect(screen.getByText('No pages yet')).toBeTruthy();
  });

  it('shows the app version', async () => {
    await renderSidebar([]);
    expect(screen.getByText('v1.2.3-test')).toBeTruthy();
  });

  it('links to the contributing guide and the issue tracker', async () => {
    await renderSidebar([]);
    expect(screen.getByRole('link', { name: /Contribute/ }).getAttribute('href')).toBe(
      'https://github.com/AlexSwensen/sheafly#contributing',
    );
    expect(screen.getByRole('link', { name: /Report a bug/ }).getAttribute('href')).toBe(
      'https://github.com/AlexSwensen/sheafly/issues',
    );
  });

  it('lists favorites in their own section', async () => {
    await renderSidebar([makeNote({ title: 'Starred', favorite: true })]);
    const favorites = screen.getByText('Favorites').closest('section')!;
    expect(within(favorites).getByText('Starred')).toBeTruthy();
  });

  it('expands and collapses pages to show their children', async () => {
    await renderSidebar([
      makeNote({ id: 'p', title: 'Parent' }),
      makeNote({ title: 'Child', parentId: 'p' }),
      makeNote({ id: 'leaf', title: 'Leaf' }),
    ]);
    const user = userEvent.setup();

    expect(screen.queryByText('Child')).toBeNull();
    await user.click(within(row('Parent')).getByRole('button', { name: 'Expand' }));
    expect(screen.getByText('Child')).toBeTruthy();
    await user.click(within(row('Parent')).getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByText('Child')).toBeNull();

    await user.click(within(row('Leaf')).getByRole('button', { name: 'Expand' }));
    expect(screen.getByText('No pages inside')).toBeTruthy();
  });

  it('highlights the current page and navigates on click', async () => {
    const note = makeNote({ title: 'Current' });
    const onNavigate = vi.fn();
    await renderSidebar([note, makeNote({ title: 'Other' })], { currentId: note.id, onNavigate });

    expect(row('Current').className).toContain('bg-active');
    expect(row('Other').className).not.toContain('bg-active');
    await userEvent.click(screen.getByText('Other'));
    expect(onNavigate).toHaveBeenCalledWith(expect.stringMatching(/^#\/p\//));
  });

  it('creates top-level and nested pages', async () => {
    const onNavigate = vi.fn();
    await renderSidebar([makeNote({ id: 'p', title: 'Parent' })], { onNavigate });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /New page/ }));
    await user.click(within(row('Parent')).getByTitle('Add a page inside'));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(2));
    const created = (await db.notes.toArray()).filter((n) => n.id !== 'p');
    expect(created.map((n) => n.parentId).sort()).toEqual([null, 'p'].sort());
  });

  it('favorites, moves and trashes pages from the item menu', async () => {
    const onNavigate = vi.fn();
    await renderSidebar(
      [
        makeNote({ id: 'p', title: 'Parent' }),
        makeNote({ id: 'c', title: 'Child', parentId: 'p' }),
      ],
      { currentId: 'c', onNavigate, initiallyExpanded: ['p'] },
    );
    const user = userEvent.setup();
    const openMenu = (title: string) => user.click(within(row(title)).getByTitle('More'));

    await openMenu('Child');
    await user.click(screen.getByText('★ Add to favorites'));
    await waitFor(async () => expect((await db.notes.get('c'))!.favorite).toBe(true));

    await openMenu('Child');
    await user.click(screen.getByText('⇱ Move to top level'));
    await waitFor(async () => expect((await db.notes.get('c'))!.parentId).toBeNull());

    await openMenu('Child');
    await user.click(screen.getByText('🗑 Move to trash'));
    await waitFor(async () => expect((await db.notes.get('c'))!.trashed).toBe(true));
    expect(onNavigate).toHaveBeenCalledWith('#/');
  });

  it('does not offer "Move to top level" for top-level pages', async () => {
    await renderSidebar([makeNote({ title: 'Top' })]);
    await userEvent.click(within(row('Top')).getByTitle('More'));
    expect(screen.queryByText('⇱ Move to top level')).toBeNull();
  });
  it('duplicates a page', async () => {
    await renderSidebar([makeNote({ id: 'a', title: 'Original', content: { type: 'doc' } })]);
    const user = userEvent.setup();
    await user.click(within(row('Original')).getByTitle('More'));
    await user.click(screen.getByText('⧉ Duplicate'));

    const notes = await db.notes.toArray();
    expect(notes.length).toBe(2);
    const copy = notes.find((n) => n.id !== 'a');
    expect(copy?.title).toBe('Original (copy)');
    expect(copy?.content).toEqual({ type: 'doc' });
  });

  it('moves a page by dragging it onto another page or the Pages section', async () => {
    await renderSidebar([
      makeNote({ id: 'a', title: 'Drag me' }),
      makeNote({ id: 'b', title: 'Drop here' }),
    ]);
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: '',
    };

    fireEvent.dragStart(row('Drag me'), { dataTransfer });
    fireEvent.dragOver(row('Drop here'), { dataTransfer });
    expect(row('Drop here').className).toContain('inset-ring-accent');
    fireEvent.drop(row('Drop here'), { dataTransfer });
    await waitFor(async () => expect((await db.notes.get('a'))!.parentId).toBe('b'));

    const pages = screen.getByText('Pages').closest('section')!;
    fireEvent.dragOver(pages, { dataTransfer });
    fireEvent.drop(pages, { dataTransfer });
    await waitFor(async () => expect((await db.notes.get('a'))!.parentId).toBeNull());
  });

  it('wires up the navigation and footer buttons', async () => {
    const props = {
      onSearch: vi.fn(),
      onNavigate: vi.fn(),
      onToggleTheme: vi.fn(),
      onLogout: vi.fn(),
      onClose: vi.fn(),
    };
    await renderSidebar([], { ...props, route: 'trash', theme: 'dark' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Search/ }));
    await user.click(screen.getByRole('button', { name: /Home/ }));
    await user.click(screen.getByRole('button', { name: /Trash/ }));
    await user.click(screen.getByRole('button', { name: /Light mode/ }));
    await user.click(screen.getByRole('button', { name: /Log out/ }));
    await user.click(screen.getByTitle(/Close sidebar/));

    expect(props.onSearch).toHaveBeenCalled();
    expect(props.onNavigate.mock.calls).toEqual([['#/'], ['#/trash']]);
    expect(props.onToggleTheme).toHaveBeenCalled();
    expect(props.onLogout).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Trash/ }).className).toContain('bg-hover');
  });

  describe('sync indicator', () => {
    it('shows pending changes and syncs on click', async () => {
      const sync = vi.spyOn(syncEngine, 'sync').mockResolvedValue();
      await renderSidebar([makeNote({ dirty: 1 }), makeNote({ dirty: 1 })]);

      await userEvent.click(screen.getByRole('button', { name: '2 pending' }));
      expect(sync).toHaveBeenCalled();
    });

    it('says everything is synced when nothing is pending', async () => {
      await renderSidebar([makeNote()]);
      expect(screen.getByRole('button', { name: 'All changes synced' })).toBeTruthy();
    });

    it.each([
      ['offline', null, 1, 'Offline · 1 unsynced'],
      ['offline', null, 0, 'Offline'],
      ['error', 'Session expired', 0, 'Sync error: Session expired'],
      ['syncing', null, 0, 'Syncing…'],
    ] as const)('shows %s status', async (status, error, dirty, label) => {
      syncEngine.status = status;
      syncEngine.error = error;
      await renderSidebar(dirty ? [makeNote({ dirty: 1 })] : []);
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
      syncEngine.status = 'idle';
      syncEngine.error = null;
    });
  });
});
