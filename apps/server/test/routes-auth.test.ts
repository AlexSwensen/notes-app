import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, signup } from './helpers.ts';

const post = (app: ReturnType<typeof makeApp>, url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });

describe('GET /api/config', () => {
  it('reports sign-ups as open when allowed', async () => {
    const app = makeApp();
    assert.deepEqual((await app.inject({ url: '/api/config' })).json(), { allowSignup: true });
  });

  it('keeps sign-up open for the very first account even when disabled', async () => {
    const app = makeApp({ allowSignup: false });
    assert.deepEqual((await app.inject({ url: '/api/config' })).json(), { allowSignup: true });
    await signup(app);
    assert.deepEqual((await app.inject({ url: '/api/config' })).json(), { allowSignup: false });
  });
});

describe('POST /api/auth/signup', () => {
  it('returns a working token and the public user', async () => {
    const app = makeApp();
    const res = await post(app, '/api/auth/signup', { email: 'new@example.com', password: 'password123' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.user.email, 'new@example.com');
    assert.equal(body.user.passwordHash, undefined);

    const me = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${body.token}` } });
    assert.deepEqual(me.json(), body.user);
  });

  for (const [label, payload] of [
    ['missing body', undefined],
    ['missing email', { password: 'password123' }],
    ['non-string email', { email: 42, password: 'password123' }],
    ['email without domain', { email: 'nobody@', password: 'password123' }],
    ['email with spaces', { email: 'a b@example.com', password: 'password123' }],
    ['overlong email', { email: `${'a'.repeat(250)}@example.com`, password: 'password123' }],
  ] as const) {
    it(`rejects an invalid email (${label})`, async () => {
      const res = await post(makeApp(), '/api/auth/signup', payload);
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error, 'Enter a valid email');
    });
  }

  for (const [label, password] of [['too short', 'short'], ['too long', 'x'.repeat(257)], ['not a string', 12345678]] as const) {
    it(`rejects a password that is ${label}`, async () => {
      const res = await post(makeApp(), '/api/auth/signup', { email: 'a@example.com', password });
      assert.equal(res.statusCode, 400);
      assert.match(res.json().error, /at least 8/);
    });
  }

  it('rejects duplicate emails regardless of case', async () => {
    const app = makeApp();
    await signup(app, 'a@example.com');
    const res = await post(app, '/api/auth/signup', { email: 'A@EXAMPLE.COM', password: 'password123' });
    assert.equal(res.statusCode, 409);
  });

  it('is closed after the first account when sign-ups are disabled', async () => {
    const app = makeApp({ allowSignup: false });
    await signup(app);
    const res = await post(app, '/api/auth/signup', { email: 'b@example.com', password: 'password123' });
    assert.equal(res.statusCode, 403);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right password, case-insensitive email and surrounding spaces', async () => {
    const app = makeApp();
    await signup(app, 'a@example.com');
    const res = await post(app, '/api/auth/login', { email: '  A@Example.com ', password: 'password123' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().user.email, 'a@example.com');
  });

  it('gives the same error for unknown users and wrong passwords', async () => {
    const app = makeApp();
    await signup(app);
    const wrong = await post(app, '/api/auth/login', { email: 'a@example.com', password: 'nope-nope' });
    const unknown = await post(app, '/api/auth/login', { email: 'who@example.com', password: 'password123' });
    assert.equal(wrong.statusCode, 401);
    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.json().error, unknown.json().error);
  });

  it('requires both fields', async () => {
    const app = makeApp();
    assert.equal((await post(app, '/api/auth/login', { email: 'a@example.com' })).statusCode, 400);
    assert.equal((await post(app, '/api/auth/login', {})).statusCode, 400);
  });

  it('rate limits repeated attempts from one IP', async () => {
    const app = makeApp();
    for (let i = 0; i < 20; i++) {
      assert.equal((await post(app, '/api/auth/login', { email: 'x@example.com', password: 'wrong' })).statusCode, 401);
    }
    const res = await post(app, '/api/auth/login', { email: 'x@example.com', password: 'wrong' });
    assert.equal(res.statusCode, 429);
  });

  it('shares the limit between login and sign-up', async () => {
    const app = makeApp();
    for (let i = 0; i < 20; i++) await post(app, '/api/auth/login', { email: 'x@example.com', password: 'wrong' });
    const res = await post(app, '/api/auth/signup', { email: 'new@example.com', password: 'password123' });
    assert.equal(res.statusCode, 429);
  });
});

describe('GET /api/me', () => {
  it('requires a bearer token', async () => {
    const app = makeApp();
    for (const authorization of [undefined, 'Token abc', 'Bearer ', 'Bearer forged.token']) {
      const res = await app.inject({ url: '/api/me', headers: authorization ? { authorization } : {} });
      assert.equal(res.statusCode, 401, String(authorization));
    }
  });

  it("rejects a valid token for a user that doesn't exist", async () => {
    const other = makeApp({ secret: 'shared' });
    const token = await signup(other);
    const res = await makeApp({ secret: 'shared' }).inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.statusCode, 401);
  });
});

describe('GET /api/health', () => {
  it('responds ok', async () => {
    assert.deepEqual((await makeApp().inject({ url: '/api/health' })).json(), { ok: true });
  });
});
