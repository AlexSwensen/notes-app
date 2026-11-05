import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { createTokenService } from '../src/auth/tokens.ts';
import { createRateLimiter } from '../src/auth/rate-limit.ts';

describe('password hashing', () => {
  it('produces a salted scrypt hash that verifies', async () => {
    const hash = await hashPassword('correct horse');
    assert.match(hash, /^scrypt\$[\w-]+\$[\w-]+$/);
    assert.equal(await verifyPassword('correct horse', hash), true);
    assert.equal(await verifyPassword('wrong horse', hash), false);
  });

  it('uses a fresh salt for every hash', async () => {
    assert.notEqual(await hashPassword('same'), await hashPassword('same'));
  });

  it('rejects malformed or foreign hashes', async () => {
    for (const stored of ['', 'plain', 'bcrypt$abc$def', 'scrypt$$', 'scrypt$c2FsdA']) {
      assert.equal(await verifyPassword('anything', stored), false, stored);
    }
  });
});

describe('tokens', () => {
  const tokens = createTokenService('secret');

  it('round-trips the user id', () => {
    assert.equal(tokens.verify(tokens.issue('user-1')), 'user-1');
  });

  it('rejects missing and malformed tokens', () => {
    for (const t of [undefined, '', 'abc', '.sig', 'payload.', 'a.b.c']) {
      assert.equal(tokens.verify(t), null, String(t));
    }
  });

  it('rejects tokens signed with another secret', () => {
    assert.equal(tokens.verify(createTokenService('other').issue('user-1')), null);
  });

  it('rejects tampered payloads', () => {
    const [, sig] = tokens.issue('user-1').split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + 1e9 })).toString(
      'base64url',
    );
    assert.equal(tokens.verify(`${forged}.${sig}`), null);
  });

  it('rejects correctly signed payloads with the wrong shape', () => {
    const signed = (payload: string) => {
      const body = Buffer.from(payload).toString('base64url');
      return `${body}.${createHmac('sha256', 'secret').update(body).digest('base64url')}`;
    };
    assert.equal(tokens.verify(signed(JSON.stringify({ sub: 'u', exp: Date.now() + 1e9 }))), 'u');
    assert.equal(tokens.verify(signed(JSON.stringify({ sub: 1, exp: Date.now() + 1e9 }))), null);
    assert.equal(tokens.verify(signed(JSON.stringify({ sub: 'u', exp: 'never' }))), null);
    assert.equal(tokens.verify(signed('not json')), null);
  });

  it('expires after 90 days', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 0 });
    const token = tokens.issue('user-1');
    t.mock.timers.tick(89 * 24 * 60 * 60 * 1000);
    assert.equal(tokens.verify(token), 'user-1');
    t.mock.timers.tick(2 * 24 * 60 * 60 * 1000);
    assert.equal(tokens.verify(token), null);
  });
});

describe('rate limiter', () => {
  it('allows 20 attempts per IP, then blocks', () => {
    const limited = createRateLimiter();
    for (let i = 0; i < 20; i++) assert.equal(limited('1.1.1.1'), false, `attempt ${i + 1}`);
    assert.equal(limited('1.1.1.1'), true);
    assert.equal(limited('2.2.2.2'), false);
  });

  it('resets after the 15 minute window', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 0 });
    const limited = createRateLimiter();
    for (let i = 0; i < 21; i++) limited('ip');
    assert.equal(limited('ip'), true);
    t.mock.timers.tick(15 * 60 * 1000 + 1);
    assert.equal(limited('ip'), false);
  });

  it('forgets expired entries once it tracks many IPs', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 0 });
    const limited = createRateLimiter();
    for (let i = 0; i < 20; i++) limited('busy');
    for (let i = 0; i <= 10_000; i++) limited(`ip-${i}`);
    t.mock.timers.tick(15 * 60 * 1000 + 1);
    // Triggers the sweep; "busy" starts a fresh window afterwards.
    assert.equal(limited('trigger'), false);
    assert.equal(limited('busy'), false);
  });
});
