/**
 * Real PostgreSQL cross-tenant isolation probe (WS-PROD-02).
 *
 * Executes exclusively inside a transaction that is ALWAYS rolled back, so the
 * probe can never leave persistent data behind. Two synthetic tenant identities
 * are seeded, one tenant-scoped fixture row is written under tenant A, then the
 * transaction-local context is switched to tenant B to prove:
 *
 *   1. SELECT isolation — tenant B cannot see tenant A's row.
 *   2. WRITE isolation  — tenant B cannot write a row carrying tenant A's id
 *      (denied by the WITH CHECK side of the tenant RLS policy, SQLSTATE 42501).
 *
 * The probe runs under SET LOCAL ROLE <appRole> to exercise the production
 * runtime authority path (NOBYPASSRLS, non-owner) rather than the
 * migration/owner connection.
 */
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

const PROBE_TENANT_A = '99999999-9999-9999-9999-999999999999';
const PROBE_TENANT_B = '88888888-8888-8888-8888-888888888888';

type ProbeClient = Pick<ReturnType<typeof postgres>, 'begin'>;

export interface CrossTenantProbeResult {
  table: string;
  selectIsolation: true;
  writeIsolation: true;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function expectRowCount(result: unknown): Promise<number> {
  return Array.from(result as Iterable<unknown>).length;
}

export async function runCrossTenantProbe(
  client: ProbeClient,
  options: { appRole?: string } = {},
): Promise<CrossTenantProbeResult> {
  const appRole = options.appRole ?? 'codecore_app';
  const probeId = randomUUID();
  const table = 'marketing_memory_records';

  try {
    await client.begin(async (tx) => {
      // Seed synthetic tenant parents as the (owner) connection before dropping
      // privileges. Both inserts roll back with the transaction.
      await tx.unsafe(
        `INSERT INTO tenants (id, name) VALUES ($1::uuid, $2), ($3::uuid, $4)`,
        [PROBE_TENANT_A, `ws-prod-02-probe-a-${probeId}`, PROBE_TENANT_B, `ws-prod-02-probe-b-${probeId}`],
      );

      await tx.unsafe(`SET LOCAL ROLE ${quoteIdentifier(appRole)}`);

      // Tenant A context: write a fixture row and confirm own-tenant visibility.
      await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [PROBE_TENANT_A]);
      await tx.unsafe(
        `INSERT INTO ${table} (id, tenant_id, scope, scope_id, statement)
         VALUES ($1::uuid, $2::uuid, 'ws-prod-02-probe', $3::uuid, $4)`,
        [probeId, PROBE_TENANT_A, randomUUID(), 'probe fixture (rolled back)'],
      );
      const ownVisible = await expectRowCount(
        await tx.unsafe(`SELECT 1 AS one FROM ${table} WHERE id = $1::uuid`, [probeId]),
      );
      if (ownVisible !== 1) throw new Error('PROBE_SANITY_OWN_TENANT_FAILED');

      // Tenant B context: tenant A's row must be invisible.
      await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [PROBE_TENANT_B]);
      const crossVisible = await expectRowCount(
        await tx.unsafe(`SELECT 1 AS one FROM ${table} WHERE id = $1::uuid`, [probeId]),
      );
      if (crossVisible !== 0) throw new Error('CROSS_TENANT_SELECT_ISOLATION_BROKEN');

      // Tenant B context: writing a row attributed to tenant A must be denied
      // by the WITH CHECK policy. SQLSTATE 42501 aborts the transaction, which
      // is caught below as the write-isolation PASS signal. If the INSERT
      // unexpectedly succeeds, we fail closed.
      await tx.unsafe(
        `INSERT INTO ${table} (id, tenant_id, scope, scope_id, statement)
         VALUES ($1::uuid, $2::uuid, 'ws-prod-02-probe', $3::uuid, $4)`,
        [randomUUID(), PROBE_TENANT_A, randomUUID(), 'cross-tenant write (must be denied)'],
      );
      throw new Error('CROSS_TENANT_WRITE_ISOLATION_BROKEN');
    });

    // Reaching here means the denied INSERT was accepted: isolation is broken.
    throw new Error('CROSS_TENANT_WRITE_ISOLATION_BROKEN');
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    if (
      candidate.code === '42501' ||
      /row-level security|violates row-level security policy/i.test(candidate.message ?? '')
    ) {
      return { table, selectIsolation: true, writeIsolation: true };
    }
    throw error;
  }
}
