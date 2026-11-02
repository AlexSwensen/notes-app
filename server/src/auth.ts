import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64url'), expected.length);
  return timingSafeEqual(key, expected);
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90;

export function createTokenService(secret: string) {
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    issue(userId: string): string {
      const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    verify(token: string | undefined): string | null {
      if (!token) return null;
      const [payload, sig] = token.split('.');
      if (!payload || !sig) return null;
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(sig);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      try {
        const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (typeof sub !== 'string' || typeof exp !== 'number' || exp < Date.now()) return null;
        return sub;
      } catch {
        return null;
      }
    },
  };
}
