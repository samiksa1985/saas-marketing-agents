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
 *   - Safe to run repeatedly (converges attributes, grants, default privileges).
 *   - Never owns protected tenant tables; ownership stays with codecore_owner.
 *   - Never logs or echoes the application password.
 *   - Bounded grants: schema USAGE, table DML, sequence USAGE/SELECT only.
 */
import postgres from 'postgres';

const OWNER_ROLE = 'codecore_owner';
const APP_ROLE = 'codecore_app';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

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
  // Converge identity attributes. ALTER ROLE only touches the flags listed;
  // INHERIT is disabled so membership calisthenics cannot widen authority.
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
}

async function assertTableOwnershipGuard(client: SqlClient): Promise<{ checked: number }> {
  // codecore_app must NEVER own a protected (tenant-scoped) application table.
  const violations = Array.from(
    (await client.unsafe(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
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
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (
           SELECT 1 FROM pg_attribute a
           WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
         )`,
    )) as Iterable<{ count: number }>,
  );
  return { checked: Number(owned[0]?.count ?? 0) };
}

async function grantBoundedRuntimePrivileges(client: SqlClient): Promise<void> {
  // Schema visibility and DML on existing objects only.
  await client.unsafe(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(APP_ROLE)}`);
  await client.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(APP_ROLE)}`,
  );
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
      `SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    )) as Iterable<{ owner: string }>,
  );
  for (const { owner } of owners) {
    await client.unsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoteIdentifier(APP_ROLE)}`,
    );
    await client.unsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${quoteIdentifier(APP_ROLE)}`,
    );
  }
}

async function run(): Promise<void> {
  // Provisioning runs under the migration authority. MIGRATION_DATABASE_URL
  // takes precedence; DATABASE_URL is the fallback for single-credential
  // pilots. The URL is never printed.
  const databaseUrl = process.env.MIGRATION_DATABASE_URL?.trim() || required('DATABASE_URL');
  const appPassword = process.env.CODECORE_APP_PASSWORD?.trim();

  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
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
        passwordRotation: appPassword ? 'applied' : 'skipped',
        protectedTablesChecked: guard.checked,
      }) + '\n',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = /^[A-Z][A-Z0-9_]+/.exec(message)?.[0] ?? 'PROVISION_PRODUCTION_ROLES_FAILED';
    process.stderr.write(JSON.stringify({ status: 'failed', code }) + '\n');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await run();
