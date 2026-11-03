import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90;
// A login challenge only has to survive long enough for the user to open their authenticator.
const CHALLENGE_TTL_MS = 1000 * 60 * 10;

interface Payload {
  sub: string;
  exp: number;
  /** Distinguishes a short-lived two-factor challenge from a full session token. */
  kind?: 'session' | '2fa';
}

/**
 * Session tokens: `<payload>.<signature>`, where payload is base64url JSON `{ sub, exp, kind }`
 * and signature is an HMAC-SHA256 of the payload using the server secret. A `kind: '2fa'`
 * token is a login challenge and is never accepted as a session.
 */
export function createTokenService(secret: string) {
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

  const encode = (payload: Payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${sign(body)}`;
  };

  const decode = (token: string | undefined): Payload | null => {
    if (!token) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const { sub, exp, kind } = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (typeof sub !== 'string' || typeof exp !== 'number' || exp < Date.now()) return null;
      return { sub, exp, kind };
    } catch {
      return null;
    }
  };

  return {
    issue(userId: string): string {
      return encode({ sub: userId, exp: Date.now() + TOKEN_TTL_MS });
    },
    /** Returns the user id for a valid, unexpired session token (not a 2fa challenge). */
    verify(token: string | undefined): string | null {
      const payload = decode(token);
      return payload && payload.kind !== '2fa' ? payload.sub : null;
    },
    /** Issues a short-lived token proving the password step of a 2FA login succeeded. */
    issueChallenge(userId: string): string {
      return encode({ sub: userId, exp: Date.now() + CHALLENGE_TTL_MS, kind: '2fa' });
    },
    /** Returns the user id for a valid, unexpired 2FA challenge token. */
    verifyChallenge(token: string | undefined): string | null {
      const payload = decode(token);
      return payload && payload.kind === '2fa' ? payload.sub : null;
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
