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
export const PRODUCTION_WORKFLOW_RUNTIME_TABLES = [
  'codecore_workflow_executions',
  'codecore_workflow_execution_events',
];
export const PRODUCTION_CONTROL_TABLES = [
  'tenants',
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'tenant_members',
];
export const PRODUCTION_RESTRICTED_BROWSER_AUTH_TABLES = [
  'codecore_oidc_login_transactions',
  'codecore_web_sessions',
];

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

interface SessionIdentityRow extends RoleAttributesRow {
  session_user: string;
}

/** Fail closed when the RUNTIME connection identity carries unsafe authority. */
export async function assertRuntimeRoleIsSafe(client: SqlClient): Promise<string> {
  const row = rowsOf<SessionIdentityRow>(
    await client.unsafe(
      `SELECT current_user AS name, session_user, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole,
              r.rolinherit, r.rolcanlogin
       FROM pg_roles r WHERE r.rolname = current_user`,
    ),
  )[0];
  if (!row) throw new Error('PRODUCTION_RUNTIME_ROLE_UNRESOLVABLE');
  if (row.session_user !== PRODUCTION_APP_ROLE) {
    throw new Error('PRODUCTION_RUNTIME_SESSION_USER_NOT_CODECORE_APP');
  }
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

/** Browser authentication state is accessible only through narrow definer functions. */
export async function assertBrowserAuthRuntimePrivileges(client: SqlClient, runtimeRole: string): Promise<void> {
  const tables = rowsOf<{
    relname: string;
    has_table_access: boolean;
    has_column_access: boolean;
  }>(
    await client.unsafe(
      `SELECT c.relname,
              has_table_privilege($1, c.oid, 'SELECT')
                OR has_table_privilege($1, c.oid, 'INSERT')
                OR has_table_privilege($1, c.oid, 'UPDATE')
                OR has_table_privilege($1, c.oid, 'DELETE')
                OR has_table_privilege($1, c.oid, 'TRUNCATE')
                OR has_table_privilege($1, c.oid, 'REFERENCES')
                OR has_table_privilege($1, c.oid, 'TRIGGER') AS has_table_access,
              EXISTS (
                SELECT 1
                FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                  AND (
                    has_column_privilege($1, c.oid, a.attnum, 'SELECT')
                    OR has_column_privilege($1, c.oid, a.attnum, 'INSERT')
                    OR has_column_privilege($1, c.oid, a.attnum, 'UPDATE')
                    OR has_column_privilege($1, c.oid, a.attnum, 'REFERENCES')
                  )
              ) AS has_column_access
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = ANY($2::text[])
         AND c.relkind IN ('r', 'p')`,
      [runtimeRole, ['codecore_oidc_login_transactions', 'codecore_web_sessions']],
    ),
  );
  const expectedTables = new Set(['codecore_oidc_login_transactions', 'codecore_web_sessions']);
  if (
    tables.length !== expectedTables.size ||
    tables.some((table) => !expectedTables.has(table.relname) || table.has_table_access || table.has_column_access)
  ) {
    throw new Error('PRODUCTION_BROWSER_AUTH_TABLE_ACCESS_FORBIDDEN');
  }

  const functions = rowsOf<{ proname: string; executable: boolean }>(
    await client.unsafe(
      `SELECT p.proname, has_function_privilege($1, p.oid, 'EXECUTE') AS executable
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = ANY($2::text[])`,
      [
        runtimeRole,
        [
          'codecore_start_oidc_login',
          'codecore_consume_oidc_login',
          'codecore_create_web_session',
          'codecore_lookup_web_session',
          'codecore_revoke_web_session',
          'codecore_rotate_web_session',
          'codecore_list_user_tenants',
        ],
      ],
    ),
  );
  if (functions.length !== 7 || functions.some((fn) => !fn.executable)) {
    throw new Error('PRODUCTION_BROWSER_AUTH_FUNCTION_GRANTS_INVALID');
  }
}

/** Runtime DML is allowlisted; browser-auth tables remain function-only. */
export async function assertWorkflowRuntimePrivileges(client: SqlClient, runtimeRole: string): Promise<void> {
  const tableNames = [
    ...PRODUCTION_WORKFLOW_RUNTIME_TABLES,
    ...PRODUCTION_CONTROL_TABLES,
    ...PRODUCTION_RESTRICTED_BROWSER_AUTH_TABLES,
  ];
  const rows = rowsOf<{
    relname: string;
    has_select: boolean;
    has_insert: boolean;
    has_update: boolean;
    has_delete: boolean;
    has_truncate: boolean;
    has_references: boolean;
    has_trigger: boolean;
  }>(
    await client.unsafe(
      `SELECT c.relname,
              has_table_privilege($1, c.oid, 'SELECT') AS has_select,
              has_table_privilege($1, c.oid, 'INSERT') AS has_insert,
              has_table_privilege($1, c.oid, 'UPDATE') AS has_update,
              has_table_privilege($1, c.oid, 'DELETE') AS has_delete,
              has_table_privilege($1, c.oid, 'TRUNCATE') AS has_truncate,
              has_table_privilege($1, c.oid, 'REFERENCES') AS has_references,
              has_table_privilege($1, c.oid, 'TRIGGER') AS has_trigger
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = ANY($2::text[])
         AND c.relkind IN ('r', 'p')`,
      [runtimeRole, tableNames],
    ),
  );
  const byName = new Map(rows.map((row) => [row.relname, row]));
  for (const table of PRODUCTION_WORKFLOW_RUNTIME_TABLES) {
    const row = byName.get(table);
    if (!row || !row.has_select || !row.has_insert || !row.has_update || !row.has_delete) {
      throw new Error('PRODUCTION_WORKFLOW_RUNTIME_GRANTS_INVALID');
    }
  }
  for (const table of PRODUCTION_CONTROL_TABLES) {
    const row = byName.get(table);
    if (!row || row.has_insert || row.has_update || row.has_delete || row.has_truncate || row.has_references || row.has_trigger) {
      throw new Error('PRODUCTION_CONTROL_TABLE_MUTATION_FORBIDDEN');
    }
  }
  for (const table of PRODUCTION_RESTRICTED_BROWSER_AUTH_TABLES) {
    const row = byName.get(table);
    if (!row || row.has_select || row.has_insert || row.has_update || row.has_delete) {
      throw new Error('PRODUCTION_BROWSER_AUTH_TABLE_ACCESS_FORBIDDEN');
    }
  }
}

/** Scheduler boundary: narrow SECURITY DEFINER functions, exactly owner-controlled. */
export async function assertWorkflowSchedulerPrivileges(client: SqlClient, runtimeRole: string): Promise<void> {
  const functions = rowsOf<{
    proname: string;
    executable: boolean;
    owner: string;
    table_owner: string | null;
    public_execute: boolean;
    security_definer: boolean;
    search_path: string | null;
    identity_args: string;
    returns_set: boolean;
  }>(
    await client.unsafe(
      `SELECT p.proname,
              has_function_privilege($1, p.oid, 'EXECUTE') AS executable,
              pg_get_userbyid(p.proowner) AS owner,
              (SELECT pg_get_userbyid(c.relowner)
               FROM pg_class c JOIN pg_namespace cn ON cn.oid = c.relnamespace
               WHERE cn.nspname = 'public' AND c.relname = 'codecore_workflow_executions') AS table_owner,
              has_function_privilege(0, p.oid, 'EXECUTE') AS public_execute,
              p.prosecdef AS security_definer,
              (SELECT string_agg(s, ',') FROM unnest(p.proconfig) AS s WHERE s LIKE 'search_path=%') AS search_path,
              pg_get_function_identity_arguments(p.oid) AS identity_args,
              p.proretset AS returns_set
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('codecore_claim_workflow_execution', 'codecore_recover_expired_workflow_leases')`,
      [runtimeRole],
    ),
  );
  if (functions.length !== 2) throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_FUNCTIONS_MISSING');
  // Identity arguments include parameter names; accept the exact typed
  // contract regardless of parameter naming.
  const expectedArgs: Record<string, string[]> = {
    codecore_claim_workflow_execution: ['character varying, integer'],
    codecore_recover_expired_workflow_leases: [''],
  };
  for (const fn of functions) {
    if (!fn.executable) throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_EXECUTE_MISSING');
    if (!fn.table_owner || fn.owner !== fn.table_owner) {
      throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_OWNER_INVALID');
    }
    if (fn.owner === runtimeRole) throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_OWNED_BY_RUNTIME');
    if (fn.public_execute) throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_PUBLIC_EXECUTE');
    if (!fn.security_definer) throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_NOT_DEFINER');
    if ((fn.search_path ?? '').replace(/\s+/g, '') !== 'search_path=pg_catalog,public') {
      throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_SEARCH_PATH_INVALID');
    }
    const expected = expectedArgs[fn.proname];
    const normalizedArgs = fn.identity_args
      .split(',')
      .map((part) => part.trim().replace(/^[A-Za-z_][A-Za-z0-9_]*\s+/, '').replace(/\s+/g, ' '))
      .join(', ')
      .trim();
    if (!expected || !expected.includes(normalizedArgs)) {
      throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_SIGNATURE_INVALID');
    }
    if (!fn.returns_set) throw new Error('PRODUCTION_WORKFLOW_SCHEDULER_SIGNATURE_INVALID');
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

/**
 * Canonical tenant-scoped RLS expressions. Whitespace is ignored, but
 * identifier quoting is NOT: a policy on "TENANT_ID" or another column
 * must fail closed because it does not enforce isolation on the real
 * tenant_id column.
 */
function isCanonicalTenantPolicyExpression(expression: string): boolean {
  const normalized = expression.replace(/\s+/g, ' ').trim();
  const form1 =
    /^\(?tenant_id = \(NULLIF\(current_setting\('app\.tenant_id'(::text)?, true\), ''(::text)?\)\)::uuid\)?$/i;
  const form2 = /^\(?\(tenant_id\)::text = current_setting\('app\.tenant_id'(::text)?, true\)\)?$/i;
  return form1.test(normalized) || form2.test(normalized);
}

/** Every tenant table must have an applicable, tenant-scoped ALL-command policy. */
export async function assertRlsPolicyCoverage(client: SqlClient): Promise<void> {
  const policies = rowsOf<{
    relname: string;
    polname: string;
    polcmd: string;
    polpermissive: boolean;
    applies_to_app: boolean;
    polqual: string | null;
    polwithcheck: string | null;
  }>(
    await client.unsafe(`
      SELECT c.relname,
             p.polname,
             p.polcmd,
             p.polpermissive,
             (0::oid = ANY(p.polroles) OR 'codecore_app'::regrole::oid = ANY(p.polroles)) AS applies_to_app,
             pg_get_expr(p.polqual, p.polrelid) AS polqual,
             pg_get_expr(p.polwithcheck, p.polrelid) AS polwithcheck
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
        AND a.attnum > 0
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    `),
  );

  const tenantTables = new Set(policies.map((p) => p.relname));
  const gaps: string[] = [];

  for (const table of tenantTables) {
    const tablePolicies = policies.filter((p) => p.relname === table);
    const rlsEnabled = tablePolicies.some((p) => p.polname !== null);
    if (!rlsEnabled) {
      gaps.push(table);
      continue;
    }

    const validAllPolicy = tablePolicies.some(
      (p) =>
        p.polpermissive &&
        p.polcmd === '*' &&
        p.applies_to_app &&
        isCanonicalTenantPolicyExpression(p.polqual ?? '') &&
        isCanonicalTenantPolicyExpression(p.polwithcheck ?? p.polqual ?? ''),
    );
    const invalidPolicy = tablePolicies.some(
      (p) =>
        p.applies_to_app &&
        (!p.polpermissive ||
          p.polcmd !== '*' ||
          !isCanonicalTenantPolicyExpression(p.polqual ?? '') ||
          !isCanonicalTenantPolicyExpression(p.polwithcheck ?? p.polqual ?? '')),
    );

    if (!validAllPolicy || invalidPolicy) {
      gaps.push(table);
    }
  }

  if (gaps.length > 0) {
    throw new Error(`TENANT_POLICY_COVERAGE_GAP:${gaps.slice(0, 5).join(',')}`);
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
