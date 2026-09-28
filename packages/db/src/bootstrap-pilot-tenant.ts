import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import postgres from 'postgres';

type BootstrapInput = { tenantId: string; tenantName: string; adminSubject: string; adminDisplayName: string };
const required = (name: string, value: string | undefined): string => { if (!value?.trim()) throw new Error(`${name}_REQUIRED`); return value.trim(); };
const stableUuid = (value: string): string => { const hash = createHash('sha256').update(value).digest('hex'); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`; };
export function pilotBootstrapInput(env: NodeJS.ProcessEnv): BootstrapInput {
  if (env.PILOT_BOOTSTRAP_CONFIRM !== 'YES') throw new Error('PILOT_BOOTSTRAP_CONFIRM_REQUIRED');
  const tenantId = required('PILOT_TENANT_ID', env.PILOT_TENANT_ID);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) throw new Error('PILOT_TENANT_ID_INVALID');
  return { tenantId, tenantName: required('PILOT_TENANT_NAME', env.PILOT_TENANT_NAME), adminSubject: required('PILOT_ADMIN_SUBJECT', env.PILOT_ADMIN_SUBJECT), adminDisplayName: required('PILOT_ADMIN_DISPLAY_NAME', env.PILOT_ADMIN_DISPLAY_NAME) };
}

/** The bootstrap touches PostgreSQL only; it must not require application,
 * Temporal, provider, artifact, or AI runtime configuration. */
export function pilotBootstrapDatabaseUrl(env: NodeJS.ProcessEnv): string {
  return required('DATABASE_URL', env.DATABASE_URL);
}

export async function bootstrapPilotTenant(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const input = pilotBootstrapInput(env);
  const client = postgres(pilotBootstrapDatabaseUrl(env), { max: 1, prepare: false });
  try {
  await client.begin(async (transaction) => {
    await transaction.unsafe('INSERT INTO tenants (id, name, default_locale, status) VALUES ($1::uuid, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [input.tenantId, input.tenantName, 'en', 'active']);
    const tenant = Array.from(await transaction.unsafe('SELECT name, status FROM tenants WHERE id = $1::uuid FOR UPDATE', [input.tenantId]) as Iterable<{ name: string; status: string }>)[0];
    if (!tenant || tenant.name !== input.tenantName || tenant.status !== 'active') throw new Error('PILOT_TENANT_ID_CONFLICT');
    const insertedUsers = Array.from(await transaction.unsafe('INSERT INTO users (subject, display_name) VALUES ($1, $2) ON CONFLICT (subject) DO NOTHING RETURNING id', [input.adminSubject, input.adminDisplayName]) as Iterable<{ id: string }>);
    const user = insertedUsers[0] ?? Array.from(await transaction.unsafe('SELECT id FROM users WHERE subject = $1 FOR UPDATE', [input.adminSubject]) as Iterable<{ id: string }>)[0];
    if (!user) throw new Error('PILOT_ADMIN_USER_UNAVAILABLE');
    const unrelatedMembership = Array.from(await transaction.unsafe('SELECT tenant_id FROM tenant_members WHERE user_id = $1::uuid AND tenant_id <> $2::uuid LIMIT 1', [user.id, input.tenantId]) as Iterable<{ tenant_id: string }>)[0];
    if (unrelatedMembership) throw new Error('PILOT_ADMIN_SUBJECT_CONFLICT');
    const role = Array.from(await transaction.unsafe("SELECT id FROM roles WHERE name = 'tenant_admin' LIMIT 1") as Iterable<{ id: string }>)[0];
    if (!role) throw new Error('TENANT_ADMIN_ROLE_NOT_SEEDED');
    await transaction.unsafe('INSERT INTO tenant_members (tenant_id, user_id, role_id, status) VALUES ($1::uuid, $2::uuid, $3::uuid, $4) ON CONFLICT (tenant_id, user_id) DO NOTHING', [input.tenantId, user.id, role.id, 'active']);
    const membership = Array.from(await transaction.unsafe('SELECT role_id, status FROM tenant_members WHERE tenant_id = $1::uuid AND user_id = $2::uuid FOR UPDATE', [input.tenantId, user.id]) as Iterable<{ role_id: string; status: string }>)[0];
    if (!membership || membership.role_id !== role.id || membership.status !== 'active') throw new Error('PILOT_MEMBERSHIP_CONFLICT');
    await transaction.unsafe('INSERT INTO audit_events (id, tenant_id, type, actor_type, actor_id, correlation_id, payload, occurred_at) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7::jsonb, now()) ON CONFLICT (id) DO NOTHING', [stableUuid(`pilot-bootstrap:${input.tenantId}`), input.tenantId, 'PILOT_TENANT_BOOTSTRAPPED', 'SYSTEM', user.id, `pilot-bootstrap:${input.tenantId}`, JSON.stringify({ bootstrapVersion: 1, providers: 'UNCONFIGURED_AND_DISABLED' })]);
  });
  process.stdout.write(JSON.stringify({ status: 'ready', tenantBootstrap: 'idempotent', providers: 'unconfigured_and_disabled' }) + '\n');
  } catch (error) {
  const code = error instanceof Error && /^(PILOT_|TENANT_ADMIN_ROLE_)/.test(error.message) ? error.message : 'PILOT_TENANT_BOOTSTRAP_FAILED';
  process.stderr.write(JSON.stringify({ status: 'failed', code }) + '\n');
  process.exitCode = 1;
  } finally { await client.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await bootstrapPilotTenant();
}
