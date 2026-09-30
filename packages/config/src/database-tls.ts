export function assertProductionDatabaseTls(name: string, connectionString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL connection URL`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.hash) {
    throw new Error(`${name} must be a PostgreSQL URL with a host and no fragment`);
  }

  const sslModes = parsed.searchParams.getAll('sslmode');
  if (sslModes.length !== 1 || sslModes[0] !== 'verify-full') {
    throw new Error(`${name} must set sslmode=verify-full in production`);
  }
}
