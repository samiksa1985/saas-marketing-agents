/**
 * Idempotent production role provisioning for the production PostgreSQL
 * trust-boundary architecture (WS-PROD-02):
 *
 *   codecore_owner  — migration/schema authority (created outside this script;
 *                     normally by the managed database bootstrap). This script
 *                     runs AS the owner (or a superuser) and converges the
 *                     runtime role only.
 *
 *   codecore_app    — the ONLY application runtime identity:
 *                     LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE.
 *
 * Guarantees:
 *   - Safe to run repeatedly (converges attributes, memberships, and grants).
 *   - Never owns protected tenant tables; ownership stays with codecore_owner.
 *   - Never logs or echoes the application password.
 *   - Global identity and authorization tables are read-only to application code.
 */
import postgres from 'postgres';
import { resolveSecretEnvironment } from '@platform/config';
import { assertMigrationAuthority, resolveMigrationDatabaseUrl } from '../src/migration-url.js';
import { productionPostgresOptions } from '../src/postgres-connection.js';

const OWNER_ROLE = 'codecore_owner';
const APP_ROLE = 'codecore_app';
const RESTRICTED_AUTH_TABLES = ['codecore_oidc_login_transactions', 'codecore_web_sessions'];
const CONTROL_TABLES = ['tenants', 'users', 'roles', 'permissions', 'role_permissions', 'tenant_members'];
const OPERATIONAL_RUNTIME_TABLES = [
  'artifacts',
  'artifact_versions',
  'audit_events',
  'engagements',
  'execution_errors',
  'execution_leases',
  'execution_runs',
  'execution_steps',
  'handoffs',
  'provider_calls',
  'provider_usage',
  'retry_attempts',
  'task_attempts',
  'task_dependencies',
  'tasks',
  'workflow_events',
  'workflows',
  'codecore_workflow_executions',
  'codecore_workflow_execution_events',
  'marketing_os_approval_records',
];

/** SQL identifier quoting: ALTER ROLE "x", GRANT ... TO "x". */
function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** SQL string literal quoting: PASSWORD 'x', rolname = 'x'. */
function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

type SqlClient = ReturnType<typeof postgres>;

async function convergeAppRole(client: SqlClient, password: string | undefined): Promise<void> {
  // NOINHERIT prevents implicit privilege inheritance; membership removal below
  // also prevents explicit SET ROLE escalation.
  const attrs = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT';
  const existing = Array.from(
    (await client.unsafe('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE])) as Iterable<unknown>,
  );
  if (existing.length === 0) {
    await client.unsafe(`CREATE ROLE ${quoteIdentifier(APP_ROLE)} ${attrs}`);
  } else {
    await client.unsafe(`ALTER ROLE ${quoteIdentifier(APP_ROLE)} WITH ${attrs}`);
  }
  if (password) {
    await client.unsafe(`ALTER ROLE ${quoteIdentifier(APP_ROLE)} WITH PASSWORD ${quoteLiteral(password)}`);
  }

  // Hard guard: attributes must match after convergence. Fails closed on drift.
  const drift = Array.from(
    (await client.unsafe(
      `SELECT 1 FROM pg_roles WHERE rolname = $1
         AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR NOT rolcanlogin)`,
      [APP_ROLE],
    )) as Iterable<unknown>,
  );
  if (drift.length > 0) throw new Error('CODECORE_APP_ATTRIBUTE_DRIFT');

  const memberships = Array.from(
    (await client.unsafe(
      `SELECT r.rolname
       FROM pg_roles r
       WHERE EXISTS (
         SELECT 1 FROM pg_auth_members m
         WHERE m.member = $1::regrole::oid AND m.roleid = r.rolname::regrole::oid
       )`,
      [APP_ROLE],
    )) as Iterable<{ rolname: string }>,
  );
  for (const { rolname } of memberships) {
    await client.unsafe(`REVOKE ${quoteIdentifier(rolname)} FROM ${quoteIdentifier(APP_ROLE)}`);
  }
  const remainingMemberships = Array.from(
    (await client.unsafe(
      `SELECT r.rolname
       FROM pg_roles r
      WHERE r.rolname <> $1 AND pg_has_role($1, r.rolname, 'MEMBER')`,
      [APP_ROLE],
    )) as Iterable<{ rolname: string }>,
  );
  if (remainingMemberships.length > 0) {
    throw new Error(`CODECORE_APP_ROLE_MEMBERSHIP_DRIFT:${remainingMemberships.map((r) => r.rolname).join(',')}`);
  }
}

async function assertTableOwnershipGuard(client: SqlClient): Promise<{ checked: number }> {
  // codecore_app must NEVER own a protected (tenant-scoped) application table.
  const violations = Array.from(
    (await client.unsafe(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
         AND EXISTS (
           SELECT 1 FROM pg_attribute a
           WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
         )
         AND pg_get_userbyid(c.relowner) = $1`,
      [APP_ROLE],
    )) as Iterable<{ relname: string }>,
  );
  if (violations.length > 0) {
    throw new Error(
      `CODECORE_APP_OWNS_PROTECTED_TABLES:${violations.map((v) => v.relname).join(',')}`,
    );
  }
  const owned = Array.from(
    (await client.unsafe(
      `SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
         AND EXISTS (
           SELECT 1 FROM pg_attribute a
           WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
         )`,
    )) as Iterable<{ count: number }>,
  );
  return { checked: Number(owned[0]?.count ?? 0) };
}

async function grantBoundedRuntimePrivileges(client: SqlClient): Promise<void> {
  // Runtime reads broadly, but mutation authority is explicitly allowlisted.
  await client.unsafe(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(APP_ROLE)}`);
  await client.unsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(APP_ROLE)}`);

  const tables = Array.from(
    (await client.unsafe(
      `SELECT c.relname
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       ORDER BY c.relname`,
    )) as Iterable<{ relname: string }>,
  );
  for (const { relname } of tables) {
    const table = `${quoteIdentifier('public')}.${quoteIdentifier(relname)}`;
    await client.unsafe(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE ${table} FROM PUBLIC, ${quoteIdentifier(APP_ROLE)}`,
    );
    if (CONTROL_TABLES.includes(relname)) continue;
    if (RESTRICTED_AUTH_TABLES.includes(relname)) {
      await client.unsafe(
        `REVOKE SELECT ON TABLE ${table} FROM PUBLIC, ${quoteIdentifier(APP_ROLE)}`,
      );
      continue;
    }
    if (OPERATIONAL_RUNTIME_TABLES.includes(relname)) {
      await client.unsafe(
        `GRANT INSERT, UPDATE, DELETE ON TABLE ${table} TO ${quoteIdentifier(APP_ROLE)}`,
      );
    }
  }

  const authFunctions = [
    'codecore_start_oidc_login(char, char, character varying, character varying, character varying)',
    'codecore_consume_oidc_login(char, char)',
    'codecore_create_web_session(char, character varying, uuid, character varying)',
    'codecore_lookup_web_session(char)',
    'codecore_revoke_web_session(char)',
    'codecore_rotate_web_session(char, char, character varying, uuid, character varying)',
    'codecore_list_user_tenants(character)',
  ];
  for (const signature of authFunctions) {
    await client.unsafe(`GRANT EXECUTE ON FUNCTION ${signature} TO ${quoteIdentifier(APP_ROLE)}`);
  }

  // WAVE-AB P1: the RLS-safe scheduler boundary is granted narrowly; workers
  // claim/recover only through these owner-controlled definer functions.
  const schedulerFunctions = [
    'codecore_claim_workflow_execution(character varying, integer)',
    'codecore_recover_expired_workflow_leases()',
  ];
  const existingSchedulerFunctions = Array.from(
    (await client.unsafe(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('codecore_claim_workflow_execution', 'codecore_recover_expired_workflow_leases')`,
    )) as Iterable<{ proname: string }>,
  );
  for (const signature of schedulerFunctions) {
    if (existingSchedulerFunctions.some((f) => signature.startsWith(f.proname))) {
      // Freshly created functions carry default PUBLIC EXECUTE; revoke it so
      // the runtime role holds the only application grant.
      await client.unsafe(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC`);
      await client.unsafe(`GRANT EXECUTE ON FUNCTION ${signature} TO ${quoteIdentifier(APP_ROLE)}`);
    }
  }

  await client.unsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdentifier(APP_ROLE)}`,
  );

  // Read-only visibility of the Drizzle migration ledger so the runtime
  // identity can prove the migration chain is current during verification.
  // Guarded: the schema only exists after the first migration ran.
  const drizzleSchema = Array.from(
    (await client.unsafe(`SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle'`)) as Iterable<unknown>,
  );
  if (drizzleSchema.length > 0) {
    await client.unsafe(`GRANT USAGE ON SCHEMA drizzle TO ${quoteIdentifier(APP_ROLE)}`);
    await client.unsafe(
      `GRANT SELECT ON ${quoteIdentifier('drizzle')}.${quoteIdentifier('__drizzle_migrations')} TO ${quoteIdentifier(APP_ROLE)}`,
    );
  }

  // Forward-looking default privileges for every role that owns schemas. In
  // practice this applies to codecore_owner (the migration authority); issuing
  // it for the current session user keeps the statement correct even when the
  // provisioning connection runs as a distinct bootstrap superuser.
  const owners = Array.from(
    (await client.unsafe(
      `SELECT DISTINCT owner FROM (
         SELECT pg_get_userbyid(c.relowner) AS owner
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
         UNION SELECT current_user
         UNION SELECT rolname::text FROM pg_roles WHERE rolname = $1
       ) owners`,
      [OWNER_ROLE],
    )) as Iterable<{ owner: string }>,
  );
  for (const { owner } of owners) {
    await client.unsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner)} IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM ${quoteIdentifier(APP_ROLE)}`,
    );
    await client.unsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner)} IN SCHEMA public GRANT SELECT ON TABLES TO ${quoteIdentifier(APP_ROLE)}`,
    );
    await client.unsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${quoteIdentifier(APP_ROLE)}`,
    );
  }
}

/** Bounded runtime-role provisioning/grant convergence. Runs once per call. */
export async function provisionProductionRoles(): Promise<void> {
  // Provisioning runs only through the explicit migration authority in production.
  // CODECORE_GRANTS_CONVERGE_ONLY=true skips password rotation so upgrade-time
  // grant convergence never rotates credentials.
  const convergeOnly = process.env.CODECORE_GRANTS_CONVERGE_ONLY === 'true';
  const secrets = resolveSecretEnvironment(process.env, [
    'DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    ...(convergeOnly ? [] : ['CODECORE_APP_PASSWORD']),
  ]);
  const databaseUrl = resolveMigrationDatabaseUrl(
    secrets,
    secrets.DATABASE_URL?.trim() ?? '',
    secrets.NODE_ENV,
  );
  const appPassword = secrets.CODECORE_APP_PASSWORD?.trim();
  if (secrets.NODE_ENV === 'production' && !convergeOnly && !appPassword) throw new Error('CODECORE_APP_PASSWORD_REQUIRED');

  const client = postgres(databaseUrl, productionPostgresOptions(databaseUrl, { max: 1, prepare: false }, secrets));
  try {
    if (process.env.NODE_ENV === 'production') await assertMigrationAuthority(client);
    await convergeAppRole(client, appPassword || undefined);
    const guard = await assertTableOwnershipGuard(client);
    await grantBoundedRuntimePrivileges(client);
    // Re-check the guard after grants to catch any unexpected ownership flip.
    await assertTableOwnershipGuard(client);
    process.stdout.write(
      JSON.stringify({
        status: 'ok',
        ownerRole: OWNER_ROLE,
        appRole: APP_ROLE,
        attributes: 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT',
        passwordRotation: convergeOnly ? 'skipped-converge-only' : (appPassword ? 'applied' : 'skipped'),
        protectedTablesChecked: guard.checked,
      }) + '\n',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safeMessageCode = /^[A-Z][A-Z0-9_]+/.exec(message)?.[0];
    const databaseCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(error.code)
        ? `SQLSTATE_${error.code}`
        : undefined;
    const code = safeMessageCode ?? databaseCode ?? 'PROVISION_PRODUCTION_ROLES_FAILED';
    process.stderr.write(JSON.stringify({ status: 'failed', code }) + '\n');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
