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
  rolinherit: boolean;
  rolcanlogin: boolean;
}

function rowsOf<T>(value: unknown): T[] {
  return Array.from(value as Iterable<T>);
}

/** Fail closed when the RUNTIME connection identity carries unsafe authority. */
export async function assertRuntimeRoleIsSafe(client: SqlClient): Promise<string> {
  const row = rowsOf<RoleAttributesRow>(
    await client.unsafe(
      `SELECT current_user AS name, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole,
              r.rolinherit, r.rolcanlogin
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
  if (row.rolinherit) throw new Error('PRODUCTION_RUNTIME_USER_INHERITS_ROLES');
  if (!row.rolcanlogin) throw new Error('PRODUCTION_RUNTIME_USER_CANNOT_LOGIN');
  if (row.name !== PRODUCTION_APP_ROLE) throw new Error('PRODUCTION_RUNTIME_USER_NOT_CODECORE_APP');
  return row.name;
}

/** Reject direct and transitive memberships, which can grant SET ROLE even with NOINHERIT. */
export async function assertRuntimeRoleHasNoMemberships(client: SqlClient): Promise<void> {
  const memberships = rowsOf<{ rolname: string }>(
    await client.unsafe(
      `SELECT r.rolname
       FROM pg_roles r
       WHERE r.rolname <> $1
         AND pg_has_role($1, r.rolname, 'MEMBER')
       ORDER BY r.rolname`,
      [PRODUCTION_APP_ROLE],
    ),
  );
  if (memberships.length > 0) {
    throw new Error(`PRODUCTION_RUNTIME_ROLE_MEMBERSHIP_FORBIDDEN:${memberships.map((r) => r.rolname).join(',')}`);
  }
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
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
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

/** Every tenant table must have an applicable, tenant-scoped ALL-command policy. */
export async function assertRlsPolicyCoverage(client: SqlClient): Promise<void> {
  const gaps = rowsOf<{ relname: string }>(
    await client.unsafe(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
        AND a.attnum > 0
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND (
          NOT c.relrowsecurity
          OR NOT EXISTS (
            SELECT 1 FROM pg_policy p
            WHERE p.polrelid = c.oid AND p.polpermissive AND p.polcmd = '*'
              AND (0::oid = ANY(p.polroles) OR 'codecore_app'::regrole::oid = ANY(p.polroles))
              AND regexp_replace(lower(pg_get_expr(p.polqual, p.polrelid)), '[[:space:]"]', '', 'g') IN (
                '(tenant_id=(nullif(current_setting(''app.tenant_id''::text,true),''''::text))::uuid)',
                '((tenant_id)::text=current_setting(''app.tenant_id''::text,true))'
              )
              AND regexp_replace(
                lower(pg_get_expr(COALESCE(p.polwithcheck, p.polqual), p.polrelid)),
                '[[:space:]"]',
                '',
                'g'
              ) IN (
                '(tenant_id=(nullif(current_setting(''app.tenant_id''::text,true),''''::text))::uuid)',
                '((tenant_id)::text=current_setting(''app.tenant_id''::text,true))'
              )
          )
          OR EXISTS (
            SELECT 1 FROM pg_policy p
            WHERE p.polrelid = c.oid AND p.polpermissive
              AND (0::oid = ANY(p.polroles) OR 'codecore_app'::regrole::oid = ANY(p.polroles))
              AND (
                p.polcmd <> '*'
                OR COALESCE(
                  regexp_replace(lower(pg_get_expr(p.polqual, p.polrelid)), '[[:space:]"]', '', 'g'),
                  ''
                ) NOT IN (
                  '(tenant_id=(nullif(current_setting(''app.tenant_id''::text,true),''''::text))::uuid)',
                  '((tenant_id)::text=current_setting(''app.tenant_id''::text,true))'
                )
                OR COALESCE(
                  regexp_replace(
                    lower(pg_get_expr(COALESCE(p.polwithcheck, p.polqual), p.polrelid)),
                    '[[:space:]"]',
                    '',
                    'g'
                  ),
                  ''
                ) NOT IN (
                  '(tenant_id=(nullif(current_setting(''app.tenant_id''::text,true),''''::text))::uuid)',
                  '((tenant_id)::text=current_setting(''app.tenant_id''::text,true))'
                )
              )
          )
        )
      LIMIT 5
    `),
  );
  if (gaps.length > 0) {
    throw new Error(`TENANT_POLICY_COVERAGE_GAP:${gaps.map((g) => g.relname).join(',')}`);
  }
}

/** Startup gate shared by the verifier and production API composition. */
export async function assertProductionRuntimeAuthority(client: SqlClient): Promise<string> {
  const role = await assertRuntimeRoleIsSafe(client);
  await assertNoProtectedTablesOwnedByRuntime(client, role);
  await assertRuntimeRoleHasNoMemberships(client);
  return role;
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
        `SELECT r.rolname AS name, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole,
                r.rolinherit, r.rolcanlogin
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
  if (app.rolinherit) throw new Error('PRODUCTION_APP_ROLE_INHERITS_ROLES');
  if (!app.rolcanlogin) throw new Error('PRODUCTION_APP_ROLE_CANNOT_LOGIN');
  await assertRuntimeRoleHasNoMemberships(client);

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
