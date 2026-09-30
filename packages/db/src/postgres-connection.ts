import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import postgres from 'postgres';
import { assertProductionDatabaseTls } from '@platform/config';

type PostgresOptions = NonNullable<Parameters<typeof postgres>[1]>;

export function productionPostgresOptions(
  connectionString: string,
  options: PostgresOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): PostgresOptions {
  if (env.NODE_ENV !== 'production') return options;

  assertProductionDatabaseTls('DATABASE_URL', connectionString);
  const caFile = env.DATABASE_SSL_CA_FILE?.trim();
  if (!caFile) return options;
  if (!isAbsolute(caFile)) throw new Error('DATABASE_SSL_CA_FILE must be an absolute path');

  let ca: Buffer;
  try {
    ca = readFileSync(caFile);
  } catch {
    throw new Error('DATABASE_SSL_CA_FILE_UNREADABLE');
  }
  if (ca.length === 0) throw new Error('DATABASE_SSL_CA_FILE_EMPTY');

  return {
    ...options,
    ssl: { ca, rejectUnauthorized: true },
  };
}
