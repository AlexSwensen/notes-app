import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.ts';

const VARS = ['DATA_DIR', 'AUTH_SECRET', 'ALLOW_SIGNUP', 'STATIC_DIR', 'TRUST_PROXY', 'PORT', 'HOST'];

describe('loadConfig', () => {
  let saved: Record<string, string | undefined>;
  let dataDir: string;

  beforeEach(() => {
    saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
    for (const k of VARS) delete process.env[k];
    dataDir = join(mkdtempSync(join(tmpdir(), 'notes-config-')), 'data');
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    for (const k of VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('uses safe defaults', () => {
    const config = loadConfig();
    assert.equal(config.dataDir, dataDir);
    assert.equal(config.dbFile, join(dataDir, 'notes.db'));
    assert.equal(config.allowSignup, true);
    assert.equal(config.trustProxy, false);
    assert.equal(config.port, 3000);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.staticDir, resolve(import.meta.dirname, '../../client/dist'));
  });

  it('creates the data directory and a private secret key that is reused', () => {
    const first = loadConfig();
    const keyFile = join(dataDir, 'secret.key');
    assert.equal(statSync(keyFile).mode & 0o777, 0o600);
    assert.ok(first.secret.length >= 32);
    assert.equal(readFileSync(keyFile, 'utf8'), first.secret);
    assert.equal(loadConfig().secret, first.secret);
  });

  it('prefers AUTH_SECRET over the key file', () => {
    process.env.AUTH_SECRET = 'from-env';
    assert.equal(loadConfig().secret, 'from-env');
  });

  it('reads the remaining settings from the environment', () => {
    Object.assign(process.env, {
      ALLOW_SIGNUP: 'false', TRUST_PROXY: 'true', PORT: '8080', HOST: '127.0.0.1', STATIC_DIR: '/srv/www',
    });
    const config = loadConfig();
    assert.equal(config.allowSignup, false);
    assert.equal(config.trustProxy, true);
    assert.equal(config.port, 8080);
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.staticDir, '/srv/www');
  });

  it('only disables sign-ups for the exact value "false"', () => {
    process.env.ALLOW_SIGNUP = 'no';
    assert.equal(loadConfig().allowSignup, true);
  });
});
