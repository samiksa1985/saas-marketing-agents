/**
 * Migration authority separation (WS-PROD-02).
 *
 * Migrations and role provisioning may run as a privileged migration identity
 * (codecore_owner) while the application's runtime pool connects as the
 * restricted runtime identity (codecore_app) via DATABASE_URL.
 *
 * Neither URL is ever logged by callers of this helper.
 */
import type postgres from 'postgres';
import { readSecretEnvironmentValue } from '@platform/config';

export function resolveMigrationDatabaseUrl(
  env: NodeJS.ProcessEnv,
  runtimeDatabaseUrl: string,
  nodeEnv = 'development',
): string {
  const override = readSecretEnvironmentValue('MIGRATION_DATABASE_URL', env)?.trim();
  if (nodeEnv === 'production' && !override) {
    throw new Error('PRODUCTION_MIGRATION_DATABASE_URL_REQUIRED');
  }
  const runtimeUrl = runtimeDatabaseUrl.trim();
  if (!override && !runtimeUrl) throw new Error('DATABASE_URL_REQUIRED');
  return override || runtimeUrl;
}

type SqlClient = Pick<ReturnType<typeof postgres>, 'unsafe'>;

export async function assertMigrationAuthority(client: SqlClient): Promise<string> {
  const rows = Array.from(
    (await client.unsafe(
      `SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole,
              has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public
       FROM pg_roles WHERE rolname = current_user`,
    )) as Iterable<{
      name: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      can_create_public: boolean;
    }>,
  );
  const role = rows[0];
  if (!role) throw new Error('PRODUCTION_MIGRATION_ROLE_UNRESOLVABLE');
  if (role.name === 'codecore_app') throw new Error('PRODUCTION_MIGRATION_ROLE_IS_RUNTIME');
  if (!role.rolsuper && !(role.rolcreatedb && role.rolcreaterole)) {
    throw new Error('PRODUCTION_MIGRATION_ROLE_NOT_PRIVILEGED');
  }
  if (!role.can_create_public) throw new Error('PRODUCTION_MIGRATION_ROLE_CANNOT_CREATE_SCHEMA_OBJECTS');
  return role.name;
}
