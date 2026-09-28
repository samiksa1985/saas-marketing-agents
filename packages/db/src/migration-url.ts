/**
 * Migration authority separation (WS-PROD-02).
 *
 * Migrations and role provisioning may run as a privileged migration identity
 * (codecore_owner) while the application's runtime pool connects as the
 * restricted runtime identity (codecore_app) via DATABASE_URL.
 *
 * Neither URL is ever logged by callers of this helper.
 */
export function resolveMigrationDatabaseUrl(
  env: { MIGRATION_DATABASE_URL?: string | undefined },
  runtimeDatabaseUrl: string,
): string {
  const override = env.MIGRATION_DATABASE_URL?.trim();
  return override ? override : runtimeDatabaseUrl;
}
