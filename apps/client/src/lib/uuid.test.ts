import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuid } from './uuid';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uuid', () => {
  it('returns unique v4 UUIDs', () => {
    const a = uuid();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid()).not.toBe(a);
  });

  it('works without crypto.randomUUID (plain HTTP)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(uuid()).toHaveLength(36);
  });
});
