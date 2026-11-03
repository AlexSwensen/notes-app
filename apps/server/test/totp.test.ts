import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { base32Decode, base32Encode, generateSecret, generateTotp, totpUri, verifyTotp } from '../src/auth/totp.ts';

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    for (let i = 0; i < 50; i++) {
      const bytes = randomBytes(1 + (i % 25));
      assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
    }
  });

  it('matches known RFC 4648 vectors', () => {
    assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
    assert.equal(base32Decode('MZXW6YTBOI').toString(), 'foobar');
  });

  it('ignores case, whitespace and padding when decoding', () => {
    assert.equal(base32Decode('mz xw6y tboi=').toString(), 'foobar');
  });

  it('throws on characters outside the alphabet', () => {
    assert.throws(() => base32Decode('0189'));
  });
});

describe('generateSecret', () => {
  it('returns a fresh, decodable 160-bit secret each time', () => {
    const a = generateSecret();
    const b = generateSecret();
    assert.notEqual(a, b);
    assert.equal(base32Decode(a).length, 20);
  });
});

describe('TOTP', () => {
  const secret = generateSecret();

  it('accepts the current code', () => {
    const now = Date.now();
    assert.equal(verifyTotp(secret, generateTotp(secret, now), now), true);
  });

  it('accepts codes from the adjacent window (clock drift)', () => {
    const now = Date.now();
    assert.equal(verifyTotp(secret, generateTotp(secret, now - 30_000), now), true);
    assert.equal(verifyTotp(secret, generateTotp(secret, now + 30_000), now), true);
  });

  it('rejects codes outside the window', () => {
    const now = Date.now();
    assert.equal(verifyTotp(secret, generateTotp(secret, now - 120_000), now), false);
  });

  it('rejects malformed and wrong codes', () => {
    const now = Date.now();
    for (const bad of ['', 'abcdef', '12345', '1234567', '12 34 56']) {
      assert.equal(verifyTotp(secret, bad, now), false, bad);
    }
    const wrong = generateTotp(secret, now) === '000000' ? '111111' : '000000';
    assert.equal(verifyTotp(secret, wrong, now), false);
  });

  it('produces a six digit, zero-padded code', () => {
    assert.match(generateTotp(secret), /^\d{6}$/);
  });

  it('agrees with the RFC 6238 SHA-1 test vector', () => {
    // RFC 6238 Appendix B uses the ASCII secret "12345678901234567890".
    const rfcSecret = base32Encode(Buffer.from('12345678901234567890'));
    assert.equal(generateTotp(rfcSecret, 59_000), '287082');
    assert.equal(generateTotp(rfcSecret, 1111111109_000), '081804');
  });
});

describe('totpUri', () => {
  it('builds a scannable otpauth URI', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'a@example.com');
    assert.match(uri, /^otpauth:\/\/totp\//);
    assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP'));
    assert.ok(uri.includes('issuer=Sheafly'));
    assert.ok(uri.includes('Sheafly%3Aa%40example.com'));
  });
});
