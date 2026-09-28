/**
 * Runtime authority verification for the production PostgreSQL trust boundary
 * (WS-PROD-02). All assertions throw a coded Error whose leading token is the
 * machine-readable failure code surfaced by production-verify.ts.
 *
 * These checks are enforced by the verifier ONLY when NODE_ENV=production so
 * the accepted local pilot (phase1_owner superuser) keeps working unchanged.
 */
import type postgres from 'postgres';

export const PRODUCTION_OWNER_ROLE = 'codecore_owner';
export const PRODUCTION_APP_ROLE = 'codecore_app';

type SqlClient = Pick<ReturnType<typeof postgres>, 'unsafe'>;

interface RoleAttributesRow {
  name: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
}

function rowsOf<T>(value: unknown): T[] {
  return Array.from(value as Iterable<T>);
}

/** Fail closed when the RUNTIME connection identity carries unsafe authority. */
export async function assertRuntimeRoleIsSafe(client: SqlClient): Promise<string> {
  const row = rowsOf<RoleAttributesRow>(
    await client.unsafe(
      `SELECT current_user AS name, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole
       FROM pg_roles r WHERE r.rolname = current_user`,
    ),
  )[0];
  if (!row) throw new Error('PRODUCTION_RUNTIME_ROLE_UNRESOLVABLE');
  if (row.name === PRODUCTION_OWNER_ROLE) {
    throw new Error('PRODUCTION_RUNTIME_USER_IS_MIGRATION_OWNER');
  }
  if (row.rolsuper) throw new Error('PRODUCTION_RUNTIME_USER_SUPERUSER');
  if (row.rolbypassrls) throw new Error('PRODUCTION_RUNTIME_USER_BYPASSRLS');
  if (row.rolcreatedb) throw new Error('PRODUCTION_RUNTIME_USER_CREATEDB');
  if (row.rolcreaterole) throw new Error('PRODUCTION_RUNTIME_USER_CREATEROLE');
  return row.name;
}

/** The runtime identity must not own any protected tenant-scoped table. */
export async function assertNoProtectedTablesOwnedByRuntime(
  client: SqlClient,
  runtimeRole: string,
): Promise<void> {
  const owned = rowsOf<{ relname: string }>(
    await client.unsafe(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (
           SELECT 1 FROM pg_attribute a
           WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
         )
         AND pg_get_userbyid(c.relowner) = $1
       LIMIT 5`,
      [runtimeRole],
    ),
  );
  if (owned.length > 0) {
    throw new Error(`PRODUCTION_RUNTIME_OWNS_TENANT_TABLES:${owned.map((r) => r.relname).join(',')}`);
  }
}

/** Every tenant-scoped table must carry an ALL-command tenant policy. */
export async function assertRlsPolicyCoverage(client: SqlClient): Promise<void> {
  const gaps = rowsOf<{ relname: string }>(
    await client.unsafe(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
        AND a.attnum > 0
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        AND NOT EXISTS (
          SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd = '*'
        )
      LIMIT 5
    `),
  );
  if (gaps.length > 0) {
    throw new Error(`TENANT_POLICY_COVERAGE_GAP:${gaps.map((g) => g.relname).join(',')}`);
  }
}

/**
 * The two-tier production role topology. The RUNTIME role (codecore_app) is
 * verified strictly. The migration authority role is optional at verify time
 * because environment bootstrap may name it differently (e.g. the accepted
 * pilot uses phase1_owner); set PRODUCTION_VERIFY_REQUIRE_OWNER_ROLE=true in
 * hardened environments to require the canonical codecore_owner identity.
 */
export async function assertExpectedProductionRoles(client: SqlClient): Promise<{
  appRole: string;
  ownerRole: 'codecore_owner' | 'bootstrap-managed';
}> {
  const attributes = async (name: string): Promise<RoleAttributesRow | undefined> =>
    rowsOf<RoleAttributesRow>(
      await client.unsafe(
        `SELECT r.rolname AS name, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole
         FROM pg_roles r WHERE r.rolname = $1`,
        [name],
      ),
    )[0];

  const app = await attributes(PRODUCTION_APP_ROLE);
  if (!app) throw new Error('PRODUCTION_APP_ROLE_MISSING');
  if (app.rolsuper) throw new Error('PRODUCTION_APP_ROLE_SUPERUSER');
  if (app.rolbypassrls) throw new Error('PRODUCTION_APP_ROLE_BYPASSRLS');
  if (app.rolcreatedb) throw new Error('PRODUCTION_APP_ROLE_CREATEDB');
  if (app.rolcreaterole) throw new Error('PRODUCTION_APP_ROLE_CREATEROLE');

  const owner = await attributes(PRODUCTION_OWNER_ROLE);
  if (!owner) {
    if (process.env.PRODUCTION_VERIFY_REQUIRE_OWNER_ROLE === 'true') {
      throw new Error('PRODUCTION_OWNER_ROLE_MISSING');
    }
    return { appRole: PRODUCTION_APP_ROLE, ownerRole: 'bootstrap-managed' };
  }
  if (!owner.rolsuper && !(owner.rolcreatedb && owner.rolcreaterole)) {
    throw new Error('PRODUCTION_OWNER_ROLE_NOT_PRIVILEGED');
  }
  return { appRole: PRODUCTION_APP_ROLE, ownerRole: PRODUCTION_OWNER_ROLE };
}
