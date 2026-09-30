import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readSecretEnvironmentValue, resolveSecretEnvironment } from './secret-files.js';

function withSecretFile(contents: string, callback: (path: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'codecore-secret-file-'));
  const path = join(directory, 'secret.txt');
  try {
    writeFileSync(path, contents, { mode: 0o600 });
    callback(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a non-empty secret file takes precedence and strips one trailing newline only', () => {
  withSecretFile('file-value  \r\n', (path) => {
    const source = { DATABASE_URL: 'direct-value', DATABASE_URL_FILE: path };
    const resolved = resolveSecretEnvironment(source);
    assert.equal(resolved.DATABASE_URL, 'file-value  ');
    assert.equal(resolved.DATABASE_URL_FILE, undefined);
    assert.equal(source.DATABASE_URL, 'direct-value');
  });
});

test('a broken secret-file reference fails without exposing its path or value', () => {
  const privatePath = join(tmpdir(), 'missing-codecore-secret-file');
  assert.throws(
    () =>
      resolveSecretEnvironment({ DATABASE_URL: 'direct-canary', DATABASE_URL_FILE: privatePath }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'DATABASE_URL_FILE_UNREADABLE' &&
      !error.message.includes(privatePath) &&
      !error.message.includes('direct-canary'),
  );
});

test('empty secret files fail closed even when a direct value is also present', () => {
  withSecretFile('\r\n', (path) => {
    assert.throws(
      () => resolveSecretEnvironment({ DATABASE_URL: 'direct-canary', DATABASE_URL_FILE: path }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === 'DATABASE_URL_FILE_EMPTY' &&
        !error.message.includes('direct-canary'),
    );
  });
});

test('blank file references are unset and direct secret values remain supported', () => {
  const resolved = resolveSecretEnvironment({
    DATABASE_URL: 'direct-value',
    DATABASE_URL_FILE: '  ',
  });
  assert.equal(resolved.DATABASE_URL, 'direct-value');
  assert.equal(resolved.DATABASE_URL_FILE, undefined);
});

test('single-value resolution uses the same file precedence without logging', () => {
  withSecretFile('file-canary\n', (path) => {
    assert.equal(
      readSecretEnvironmentValue('GOOGLE_ADS_CLIENT_SECRET', {
        GOOGLE_ADS_CLIENT_SECRET: 'direct-canary',
        GOOGLE_ADS_CLIENT_SECRET_FILE: path,
      }),
      'file-canary',
    );
  });
});
