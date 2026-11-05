import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, session } from './api';
import { jsonResponse } from '../test/factories';

describe('session', () => {
  it('is empty by default', () => {
    expect(session.token).toBeNull();
    expect(session.user).toBeNull();
  });

  it('stores and clears the token and user', () => {
    session.set('tok', { id: 'u1', email: 'a@example.com' });
    expect(session.token).toBe('tok');
    expect(session.user).toEqual({ id: 'u1', email: 'a@example.com' });
    session.clear();
    expect(session.token).toBeNull();
    expect(session.user).toBeNull();
  });
});

describe('api', () => {
  it('sends a GET without a body or content type when no body is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ allowSignup: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/api/config')).resolves.toEqual({ allowSignup: true });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/config');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('sends a JSON POST with the bearer token when signed in', async () => {
    session.set('tok', { id: 'u1', email: 'a@example.com' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api('/api/sync', { since: 0 });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    });
    expect(JSON.parse(init.body)).toEqual({ since: 0 });
  });

  it('throws an ApiError with the server message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Nope' }, 409)));

    const err = await api('/api/auth/signup', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: 'Nope' });
  });

  it('uses a generic message when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })),
    );

    await expect(api('/api/me')).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    });
  });

  it('lets network errors propagate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api('/api/me')).rejects.toBeInstanceOf(TypeError);
  });
});
