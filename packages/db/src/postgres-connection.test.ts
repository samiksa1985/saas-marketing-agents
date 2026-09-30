import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { productionPostgresOptions } from './postgres-connection.js';

const verifiedUrl = 'postgresql://app@db.example.com/platform?sslmode=verify-full';

test('production PostgreSQL options require verified TLS without exposing the connection URL', () => {
  assert.deepEqual(
    productionPostgresOptions(verifiedUrl, { max: 1 }, { NODE_ENV: 'production' }),
    { max: 1 },
  );
  assert.throws(
    () => productionPostgresOptions('postgresql://app:synthetic-password@db.example.com/platform', {}, { NODE_ENV: 'production' }),
    (error: unknown) => error instanceof Error &&
      error.message === 'DATABASE_URL must set sslmode=verify-full in production' &&
      !error.message.includes('synthetic-password'),
  );
});

test('production PostgreSQL options load an external CA file with certificate verification enabled', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codecore-postgres-ca-'));
  const caFile = join(directory, 'ca.pem');
  try {
    writeFileSync(caFile, 'synthetic-ca-certificate');
    const options = productionPostgresOptions(
      verifiedUrl,
      { max: 1 },
      { NODE_ENV: 'production', DATABASE_SSL_CA_FILE: caFile },
    );
    assert.deepEqual(options.ssl, {
      ca: Buffer.from('synthetic-ca-certificate'),
      rejectUnauthorized: true,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an unreadable configured CA file fails closed without revealing its path', () => {
  const missingPath = join(tmpdir(), 'missing-codecore-postgres-ca');
  assert.throws(
    () => productionPostgresOptions(
      verifiedUrl,
      {},
      { NODE_ENV: 'production', DATABASE_SSL_CA_FILE: missingPath },
    ),
    (error: unknown) => error instanceof Error &&
      error.message === 'DATABASE_SSL_CA_FILE_UNREADABLE' &&
      !error.message.includes(missingPath),
  );
});
