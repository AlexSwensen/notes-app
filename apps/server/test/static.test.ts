import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeApp } from './helpers.ts';

function staticDir() {
  const dir = mkdtempSync(join(tmpdir(), 'notes-static-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Notes</title>');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{}');
  return dir;
}

describe('static files', () => {
  it('serves index.html at the root with no-cache', async () => {
    const r = await makeApp({ staticDir: staticDir() }).inject({ url: '/' });
    assert.equal(r.statusCode, 200);
    assert.match(r.body, /<title>Notes<\/title>/);
    assert.equal(r.headers['cache-control'], 'no-cache');
  });

  it('serves non-asset files with no-cache', async () => {
    const r = await makeApp({ staticDir: staticDir() }).inject({ url: '/manifest.webmanifest' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['cache-control'], 'no-cache');
  });

  it('falls back to index.html for page URLs with a query string', async () => {
    const r = await makeApp({ staticDir: staticDir() }).inject({ url: '/p/abc?x=1' });
    assert.equal(r.statusCode, 200);
    assert.match(r.body, /<title>Notes<\/title>/);
  });

  it('returns JSON 404s for non-GET requests and unknown API routes', async () => {
    const app = makeApp({ staticDir: staticDir() });
    for (const req of [
      { method: 'POST' as const, url: '/p/abc' },
      { method: 'GET' as const, url: '/api/nope' },
    ]) {
      const r = await app.inject(req);
      assert.equal(r.statusCode, 404, req.url);
      assert.deepEqual(r.json(), { error: 'Not found' });
    }
  });

  it('does not serve files outside the static directory', async () => {
    const app = makeApp({ staticDir: staticDir() });
    for (const url of [
      '/../../etc/passwd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/assets/..%2f..%2fetc/passwd',
    ]) {
      const r = await app.inject({ url });
      assert.doesNotMatch(r.body, /root:/, url);
      if (r.statusCode === 200) assert.match(r.body, /<title>Notes<\/title>/, url);
    }
  });

  it('is disabled when the directory does not exist', async () => {
    const app = makeApp({ staticDir: join(tmpdir(), 'definitely-missing-dir') });
    const r = await app.inject({ url: '/' });
    assert.equal(r.statusCode, 404);
    assert.equal((await app.inject({ url: '/api/health' })).statusCode, 200);
  });
});
