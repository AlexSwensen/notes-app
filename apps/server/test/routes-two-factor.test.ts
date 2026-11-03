import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, signup, auth, type TestApp } from './helpers.ts';
import { generateTotp } from '../src/auth/totp.ts';

const post = (app: TestApp, url: string, payload: unknown, token?: string) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers: token ? auth(token) : {} });

/** Enrolls a device and returns `{ id, secret }`; optionally confirms it to turn 2FA on. */
async function enroll(app: TestApp, token: string, name = 'Phone') {
  const res = await post(app, '/api/2fa/devices', { name }, token);
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  return { id: body.id as string, secret: body.secret as string };
}

async function enrollAndConfirm(app: TestApp, token: string, name = 'Phone') {
  const device = await enroll(app, token, name);
  const res = await post(app, `/api/2fa/devices/${device.id}/confirm`, { code: generateTotp(device.secret) }, token);
  assert.equal(res.statusCode, 200, res.body);
  return { ...device, confirm: res.json() as { confirmed: true; recoveryCodes?: string[] } };
}

describe('GET /api/2fa', () => {
  it('requires a session', async () => {
    assert.equal((await makeApp().inject({ url: '/api/2fa' })).statusCode, 401);
  });

  it('reports two-factor as off for a new account', async () => {
    const app = makeApp();
    const token = await signup(app);
    assert.deepEqual((await app.inject({ url: '/api/2fa', headers: auth(token) })).json(), {
      enabled: false,
      devices: [],
      recoveryCodesRemaining: 0,
    });
  });
});

describe('POST /api/2fa/devices', () => {
  it('requires a non-empty name', async () => {
    const app = makeApp();
    const token = await signup(app);
    for (const name of [undefined, '', '   ', 'x'.repeat(61)]) {
      assert.equal((await post(app, '/api/2fa/devices', { name }, token)).statusCode, 400);
    }
  });

  it('returns a secret and otpauth URI but keeps the device pending', async () => {
    const app = makeApp();
    const token = await signup(app);
    const res = await post(app, '/api/2fa/devices', { name: 'Phone' }, token);
    const body = res.json();
    assert.match(body.secret, /^[A-Z2-7]+$/);
    assert.ok(body.uri.startsWith('otpauth://totp/'));
    // Unconfirmed devices do not appear in the status or enable 2FA.
    assert.deepEqual((await app.inject({ url: '/api/2fa', headers: auth(token) })).json().devices, []);
  });

  it('keeps only the most recent pending enrollment', async () => {
    const app = makeApp();
    const token = await signup(app);
    const first = await enroll(app, token, 'One');
    await enroll(app, token, 'Two');
    // The first pending device is gone, so confirming it fails.
    const res = await post(app, `/api/2fa/devices/${first.id}/confirm`, { code: generateTotp(first.secret) }, token);
    assert.equal(res.statusCode, 404);
  });
});

describe('POST /api/2fa/devices/:id/confirm', () => {
  it('rejects an invalid code', async () => {
    const app = makeApp();
    const token = await signup(app);
    const device = await enroll(app, token);
    const res = await post(app, `/api/2fa/devices/${device.id}/confirm`, { code: '000000' }, token);
    assert.equal(res.statusCode, 400);
  });

  it('confirms the first device, enables 2FA and returns ten recovery codes', async () => {
    const app = makeApp();
    const token = await signup(app);
    const { confirm } = await enrollAndConfirm(app, token);
    assert.equal(confirm.confirmed, true);
    assert.equal(confirm.recoveryCodes?.length, 10);

    const status = (await app.inject({ url: '/api/2fa', headers: auth(token) })).json();
    assert.equal(status.enabled, true);
    assert.equal(status.devices.length, 1);
    assert.equal(status.devices[0].name, 'Phone');
    assert.equal(status.devices[0].confirmed, true);
    assert.equal(status.recoveryCodesRemaining, 10);
  });

  it('does not re-issue recovery codes for a second device', async () => {
    const app = makeApp();
    const token = await signup(app);
    await enrollAndConfirm(app, token, 'Phone');
    const { confirm } = await enrollAndConfirm(app, token, 'Laptop');
    assert.equal(confirm.recoveryCodes, undefined);
    assert.equal((await app.inject({ url: '/api/2fa', headers: auth(token) })).json().devices.length, 2);
  });

  it('cannot confirm another user’s device', async () => {
    const app = makeApp();
    const alice = await signup(app, 'alice@example.com');
    const bob = await signup(app, 'bob@example.com');
    const device = await enroll(app, alice);
    const res = await post(app, `/api/2fa/devices/${device.id}/confirm`, { code: generateTotp(device.secret) }, bob);
    assert.equal(res.statusCode, 404);
  });
});

describe('POST /api/2fa/devices/:id/delete', () => {
  it('removes a device and disables 2FA when the last one goes', async () => {
    const app = makeApp();
    const token = await signup(app);
    const device = await enrollAndConfirm(app, token);
    const res = await post(app, `/api/2fa/devices/${device.id}/delete`, {}, token);
    assert.equal(res.statusCode, 200);

    const status = (await app.inject({ url: '/api/2fa', headers: auth(token) })).json();
    assert.equal(status.enabled, false);
    assert.equal(status.recoveryCodesRemaining, 0);
  });

  it('keeps 2FA enabled while another device remains', async () => {
    const app = makeApp();
    const token = await signup(app);
    const phone = await enrollAndConfirm(app, token, 'Phone');
    await enrollAndConfirm(app, token, 'Laptop');
    await post(app, `/api/2fa/devices/${phone.id}/delete`, {}, token);
    const status = (await app.inject({ url: '/api/2fa', headers: auth(token) })).json();
    assert.equal(status.enabled, true);
    assert.equal(status.recoveryCodesRemaining, 10);
  });

  it('404s for an unknown device', async () => {
    const app = makeApp();
    const token = await signup(app);
    assert.equal((await post(app, '/api/2fa/devices/nope/delete', {}, token)).statusCode, 404);
  });
});

describe('POST /api/2fa/recovery-codes', () => {
  it('regenerates codes after confirming the password', async () => {
    const app = makeApp();
    const token = await signup(app);
    await enrollAndConfirm(app, token);
    const res = await post(app, '/api/2fa/recovery-codes', { password: 'password123' }, token);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().recoveryCodes.length, 10);
    assert.equal((await app.inject({ url: '/api/2fa', headers: auth(token) })).json().recoveryCodesRemaining, 10);
  });

  it('rejects a wrong password', async () => {
    const app = makeApp();
    const token = await signup(app);
    await enrollAndConfirm(app, token);
    assert.equal((await post(app, '/api/2fa/recovery-codes', { password: 'wrong' }, token)).statusCode, 401);
  });

  it('refuses when 2FA is not enabled', async () => {
    const app = makeApp();
    const token = await signup(app);
    assert.equal((await post(app, '/api/2fa/recovery-codes', { password: 'password123' }, token)).statusCode, 400);
  });
});

describe('two-factor login flow', () => {
  it('asks for a second factor instead of issuing a token', async () => {
    const app = makeApp();
    const token = await signup(app);
    await enrollAndConfirm(app, token);
    const res = await post(app, '/api/auth/login', { email: 'a@example.com', password: 'password123' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.twoFactorRequired, true);
    assert.equal(typeof body.challenge, 'string');
    assert.equal(body.token, undefined);
  });

  it('completes login with a TOTP code', async () => {
    const app = makeApp();
    const token = await signup(app);
    const device = await enrollAndConfirm(app, token);
    const { challenge } = (await post(app, '/api/auth/login', { email: 'a@example.com', password: 'password123' })).json();
    const res = await post(app, '/api/auth/login/2fa', { challenge, code: generateTotp(device.secret) });
    assert.equal(res.statusCode, 200);
    const me = await app.inject({ url: '/api/me', headers: auth(res.json().token) });
    assert.equal(me.json().email, 'a@example.com');
  });

  it('completes login with a recovery code and then burns it', async () => {
    const app = makeApp();
    const token = await signup(app);
    const { confirm } = await enrollAndConfirm(app, token);
    const recovery = confirm.recoveryCodes![0];
    const { challenge } = (await post(app, '/api/auth/login', { email: 'a@example.com', password: 'password123' })).json();
    assert.equal((await post(app, '/api/auth/login/2fa', { challenge, code: recovery })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/2fa', headers: auth(token) })).json().recoveryCodesRemaining, 9);

    // The same recovery code cannot be used twice.
    const retry = (await post(app, '/api/auth/login', { email: 'a@example.com', password: 'password123' })).json();
    assert.equal((await post(app, '/api/auth/login/2fa', { challenge: retry.challenge, code: recovery })).statusCode, 401);
  });

  it('rejects a bad code and a forged challenge', async () => {
    const app = makeApp();
    await signup(app);
    await enrollAndConfirm(app, await signup(app, 'c@example.com'));
    const { challenge } = (await post(app, '/api/auth/login', { email: 'c@example.com', password: 'password123' })).json();
    assert.equal((await post(app, '/api/auth/login/2fa', { challenge, code: '000000' })).statusCode, 401);
    assert.equal((await post(app, '/api/auth/login/2fa', { challenge: 'forged.token', code: '000000' })).statusCode, 401);
    assert.equal((await post(app, '/api/auth/login/2fa', { challenge })).statusCode, 400);
  });

  it('issues a session directly when the account has no 2FA', async () => {
    const app = makeApp();
    await signup(app);
    const res = await post(app, '/api/auth/login', { email: 'a@example.com', password: 'password123' });
    assert.equal(typeof res.json().token, 'string');
  });
});
