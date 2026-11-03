import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// RFC 6238 time-based one-time passwords, compatible with Google Authenticator and similar
// apps: HMAC-SHA1 over a 30-second counter, truncated to 6 digits. Implemented directly to
// keep the server dependency-free, matching the password and token helpers.

const DIGITS = 6;
const PERIOD_SECONDS = 30;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encodes bytes as unpadded RFC 4648 base32 (the format authenticator apps expect). */
export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** Decodes unpadded, case-insensitive base32. Throws on characters outside the alphabet. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** A fresh 20-byte (160-bit) secret, base32-encoded for display and QR codes. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeForCounter(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/** The current TOTP for a secret, mainly for tests. */
export function generateTotp(secret: string, atMs: number = Date.now()): string {
  return codeForCounter(secret, Math.floor(atMs / 1000 / PERIOD_SECONDS));
}

/**
 * Verifies a user-supplied code against the secret, accepting codes from the adjacent time
 * steps (`window`) to tolerate clock drift. Comparison is constant-time.
 */
export function verifyTotp(secret: string, token: string, atMs: number = Date.now(), window = 1): boolean {
  const normalized = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(atMs / 1000 / PERIOD_SECONDS);
  const expectedBuf = Buffer.from(normalized);
  for (let i = -window; i <= window; i++) {
    const candidate = Buffer.from(codeForCounter(secret, counter + i));
    if (candidate.length === expectedBuf.length && timingSafeEqual(candidate, expectedBuf)) return true;
  }
  return false;
}

/** Builds the `otpauth://totp/...` URI an authenticator app reads from the QR code. */
export function totpUri(secret: string, account: string, issuer = 'Sheafly'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
