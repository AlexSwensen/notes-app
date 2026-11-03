import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// One-time recovery codes let a user back into an account when they lose every authenticator
// device. They are high-entropy random strings, so a single SHA-256 (no salt) is enough to
// store them safely while still allowing a constant-time lookup.

const CODE_COUNT = 10;
const CODE_BYTES = 5; // 10 hex chars, shown as xxxxx-xxxxx

/** A fresh batch of human-friendly recovery codes (e.g. `3f9a1-c20b7`). */
export function generateRecoveryCodes(count = CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(CODE_BYTES).toString('hex');
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
}

/** Normalizes a code (lower-case, dashes/space stripped) so formatting never affects matching. */
export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, '');
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

/** Constant-time comparison of a stored hash against a freshly computed one. */
export function recoveryCodeMatches(code: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash);
  const actual = Buffer.from(hashRecoveryCode(code));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
