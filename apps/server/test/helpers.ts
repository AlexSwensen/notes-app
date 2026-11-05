import assert from 'node:assert/strict';
import type { Note } from '@sheafly/shared';
import { openDb } from '@sheafly/db';
import { buildApp, type AppOptions } from '../src/app.ts';

export function makeApp(opts: Partial<AppOptions> = {}) {
  return buildApp({ db: openDb(':memory:'), secret: 'test-secret', allowSignup: true, ...opts });
}

export type TestApp = ReturnType<typeof makeApp>;

export function note(id: string, updatedAt: number, extra: Partial<Note> = {}): Note {
  return {
    id,
    parentId: null,
    title: `Title ${id}`,
    icon: '',
    content: { type: 'doc' },
    text: 'hello world',
    favorite: false,
    sort: 0,
    trashed: false,
    purged: false,
    createdAt: 1,
    updatedAt,
    ...extra,
  };
}

export async function signup(app: TestApp, email = 'a@example.com', password = 'password123') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email, password },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().token as string;
}

export function sync(app: TestApp, token: string, payload: object) {
  return app.inject({
    method: 'POST',
    url: '/api/sync',
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}
