import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, signup, auth } from './helpers.ts';

const post = (app: ReturnType<typeof makeApp>, url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });
const postAuth = (app: ReturnType<typeof makeApp>, url: string, payload: unknown, token: string) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers: auth(token) });

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
  it('responds ok with the version', async () => {
    assert.deepEqual((await makeApp({ version: '1.2.3' }).inject({ url: '/api/health' })).json(), { ok: true, version: '1.2.3' });
  });

  it("reports 'dev' when no version is set", async () => {
    assert.equal((await makeApp().inject({ url: '/api/health' })).json().version, 'dev');
  });
});

describe('POST /api/me/profile', () => {
  it('requires a session', async () => {
    assert.equal((await post(makeApp(), '/api/me/profile', { email: 'x@example.com' })).statusCode, 401);
  });

  it('updates the email and reflects it on /api/me', async () => {
    const app = makeApp();
    const token = await signup(app, 'old@example.com');
    const res = await postAuth(app, '/api/me/profile', { email: 'new@example.com' }, token);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().email, 'new@example.com');
    assert.equal((await app.inject({ url: '/api/me', headers: auth(token) })).json().email, 'new@example.com');
    // The new email can log in; the old one cannot.
    assert.equal((await post(app, '/api/auth/login', { email: 'new@example.com', password: 'password123' })).statusCode, 200);
    assert.equal((await post(app, '/api/auth/login', { email: 'old@example.com', password: 'password123' })).statusCode, 401);
  });

  it('rejects an invalid email', async () => {
    const app = makeApp();
    const token = await signup(app);
    assert.equal((await postAuth(app, '/api/me/profile', { email: 'nope' }, token)).statusCode, 400);
  });

  it('rejects an email already used by another account', async () => {
    const app = makeApp();
    await signup(app, 'taken@example.com');
    const token = await signup(app, 'me@example.com');
    assert.equal((await postAuth(app, '/api/me/profile', { email: 'TAKEN@example.com' }, token)).statusCode, 409);
  });

  it('allows saving the same email unchanged', async () => {
    const app = makeApp();
    const token = await signup(app, 'me@example.com');
    assert.equal((await postAuth(app, '/api/me/profile', { email: 'me@example.com' }, token)).statusCode, 200);
  });
});

describe('POST /api/me/password', () => {
  it('requires a session', async () => {
    assert.equal((await post(makeApp(), '/api/me/password', { currentPassword: 'password123', newPassword: 'newpassword' })).statusCode, 401);
  });

  it('changes the password when the current one is correct', async () => {
    const app = makeApp();
    const token = await signup(app);
    const res = await postAuth(app, '/api/me/password', { currentPassword: 'password123', newPassword: 'brand-new-pass' }, token);
    assert.equal(res.statusCode, 200);
    assert.equal((await post(app, '/api/auth/login', { email: 'a@example.com', password: 'brand-new-pass' })).statusCode, 200);
    assert.equal((await post(app, '/api/auth/login', { email: 'a@example.com', password: 'password123' })).statusCode, 401);
  });

  it('rejects a wrong current password', async () => {
    const app = makeApp();
    const token = await signup(app);
    assert.equal((await postAuth(app, '/api/me/password', { currentPassword: 'wrong', newPassword: 'brand-new-pass' }, token)).statusCode, 401);
  });

  it('rejects a too-short new password', async () => {
    const app = makeApp();
    const token = await signup(app);
    assert.equal((await postAuth(app, '/api/me/password', { currentPassword: 'password123', newPassword: 'short' }, token)).statusCode, 400);
  });
});
