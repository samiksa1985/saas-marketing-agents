import { readFileSync } from 'node:fs';

export const SECRET_ENVIRONMENT_KEYS = [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'CODECORE_APP_PASSWORD',
  'ISOLATED_RESTORE_DATABASE_URL',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'META_ADS_ACCESS_TOKEN',
  'META_ADS_APP_SECRET',
  'OBSERVABILITY_METRICS_TOKEN',
] as const;

function readSecretFile(name: string, path: string): string {
  let value: string;
  try {
    value = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`${name}_FILE_UNREADABLE`);
  }

  if (value.endsWith('\r\n')) value = value.slice(0, -2);
  else if (value.endsWith('\n')) value = value.slice(0, -1);
  if (value.trim().length === 0) throw new Error(`${name}_FILE_EMPTY`);
  return value;
}

export function readSecretEnvironmentValue(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fileReference = env[`${name}_FILE`];
  if (fileReference !== undefined && fileReference.trim().length > 0) {
    return readSecretFile(name, fileReference);
  }
  return env[name];
}

export function resolveSecretEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  names: readonly string[] = SECRET_ENVIRONMENT_KEYS,
): NodeJS.ProcessEnv {
  const resolved = { ...env };
  for (const name of names) {
    const fileKey = `${name}_FILE`;
    const fileReference = env[fileKey];
    if (fileReference === undefined) continue;
    if (fileReference.trim().length === 0) {
      delete resolved[fileKey];
      continue;
    }
    resolved[name] = readSecretFile(name, fileReference);
    delete resolved[fileKey];
  }
  return resolved;
}
