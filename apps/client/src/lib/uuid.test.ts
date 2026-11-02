import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuid } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('uuid', () => {
  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID');
    const id = uuid();
    expect(randomUUID).toHaveBeenCalled();
    expect(id).toMatch(V4);
  });

  it('falls back to getRandomValues without crypto.randomUUID (plain HTTP)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const a = uuid();
    expect(a).toMatch(V4);
    expect(uuid()).not.toBe(a);
  });
});
