import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90;

/**
 * Session tokens: `<payload>.<signature>`, where payload is base64url JSON `{ sub, exp }`
 * and signature is an HMAC-SHA256 of the payload using the server secret.
 */
export function createTokenService(secret: string) {
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    issue(userId: string): string {
      const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    /** Returns the user id if the token is valid and not expired, otherwise `null`. */
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

export type TokenService = ReturnType<typeof createTokenService>;
