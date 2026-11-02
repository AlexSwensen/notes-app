import 'fake-indexeddb/auto';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { db } from '../lib/db';

// jsdom doesn't implement layout, which ProseMirror uses for scrolling and selection.
Element.prototype.scrollIntoView = () => {};
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = emptyRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
document.elementFromPoint = () => null;

beforeEach(async () => {
  await db.notes.clear();
  await db.meta.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});
