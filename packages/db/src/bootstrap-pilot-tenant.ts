import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from '@platform/config';
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

export async function bootstrapPilotTenant(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const input = pilotBootstrapInput(env);
  const config = loadConfig(env);
  const client = postgres(config.databaseUrl, { max: 1, prepare: false });
  try {
  await client.begin(async (transaction) => {
    await transaction.unsafe('INSERT INTO tenants (id, name, default_locale, status) VALUES ($1::uuid, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()', [input.tenantId, input.tenantName, 'en', 'active']);
    const users = Array.from(await transaction.unsafe('INSERT INTO users (subject, display_name) VALUES ($1, $2) ON CONFLICT (subject) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now() RETURNING id', [input.adminSubject, input.adminDisplayName]) as Iterable<{ id: string }>);
    const role = Array.from(await transaction.unsafe("SELECT id FROM roles WHERE name = 'tenant_admin' LIMIT 1") as Iterable<{ id: string }>)[0];
    if (!role) throw new Error('TENANT_ADMIN_ROLE_NOT_SEEDED');
    await transaction.unsafe('INSERT INTO tenant_members (tenant_id, user_id, role_id, status) VALUES ($1::uuid, $2::uuid, $3::uuid, $4) ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id, status = EXCLUDED.status, updated_at = now()', [input.tenantId, users[0]!.id, role.id, 'active']);
    await transaction.unsafe('INSERT INTO audit_events (id, tenant_id, type, actor_type, actor_id, correlation_id, payload, occurred_at) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7::jsonb, now()) ON CONFLICT (id) DO NOTHING', [stableUuid(`pilot-bootstrap:${input.tenantId}`), input.tenantId, 'PILOT_TENANT_BOOTSTRAPPED', 'SYSTEM', users[0]!.id, `pilot-bootstrap:${input.tenantId}`, JSON.stringify({ bootstrapVersion: 1, providers: 'UNCONFIGURED_AND_DISABLED' })]);
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
