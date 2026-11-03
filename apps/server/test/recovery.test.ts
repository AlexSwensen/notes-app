import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode, recoveryCodeMatches } from '../src/auth/recovery.ts';

describe('recovery codes', () => {
  it('generates the requested number of unique, formatted codes', () => {
    const codes = generateRecoveryCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) assert.match(code, /^[0-9a-f]{5}-[0-9a-f]{5}$/);
  });

  it('honors a custom count', () => {
    assert.equal(generateRecoveryCodes(3).length, 3);
  });

  it('normalizes case, dashes and spaces before matching', () => {
    assert.equal(normalizeRecoveryCode('AB12-cd34'), 'ab12cd34');
    assert.equal(normalizeRecoveryCode(' a b- c '), 'abc');
  });

  it('verifies a code against its stored hash regardless of formatting', () => {
    const [code] = generateRecoveryCodes(1);
    const hash = hashRecoveryCode(code);
    assert.equal(recoveryCodeMatches(code, hash), true);
    assert.equal(recoveryCodeMatches(code.replace('-', '').toUpperCase(), hash), true);
  });

  it('rejects a code that does not match the hash', () => {
    const hash = hashRecoveryCode('aaaaa-bbbbb');
    assert.equal(recoveryCodeMatches('ccccc-ddddd', hash), false);
    assert.equal(recoveryCodeMatches('aaaaa-bbbbb', 'not-a-real-hash'), false);
  });
});
