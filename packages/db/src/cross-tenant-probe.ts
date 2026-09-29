/**
 * Real PostgreSQL cross-tenant isolation probe (WS-PROD-02).
 *
 * Executes exclusively inside a transaction that is ALWAYS rolled back, so the
 * probe can never leave persistent data behind. Two synthetic tenant identities
 * are seeded, one tenant-scoped fixture row is written under tenant A, then the
 * transaction-local context is switched to tenant B to prove:
 *
 *   1. SELECT isolation — tenant B cannot see tenant A's row.
 *   2. INSERT isolation — tenant B cannot insert a row carrying tenant A's id.
 *   3. UPDATE/DELETE isolation — tenant B cannot mutate tenant A's row.
 *
 * The probe runs under SET LOCAL ROLE <appRole> to exercise the production
 * runtime authority path (NOBYPASSRLS, non-owner) rather than the
 * migration/owner connection.
 */
import { randomUUID } from 'node:crypto';

type ProbeTransaction = {
  unsafe(query: string, parameters?: readonly unknown[]): PromiseLike<unknown>;
  savepoint<T>(operation: (tx: ProbeTransaction) => Promise<T>): Promise<T>;
};

type ProbeClient = {
  begin(operation: (tx: ProbeTransaction) => Promise<void>): Promise<unknown>;
};

export interface CrossTenantProbeResult {
  table: string;
  selectIsolation: true;
  insertIsolation: true;
  updateIsolation: true;
  deleteIsolation: true;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function rows(result: unknown): Array<Record<string, unknown>> {
  return Array.from(result as Iterable<Record<string, unknown>>);
}

function isExpectedRlsInsertDenial(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === '42501' && /new row violates row-level security policy/i.test(candidate.message ?? '');
}

export async function runCrossTenantProbe(
  client: ProbeClient,
  options: { appRole?: string } = {},
): Promise<CrossTenantProbeResult> {
  const appRole = options.appRole ?? 'codecore_app';
  const probeId = randomUUID();
  const probeTenantA = randomUUID();
  const probeTenantB = randomUUID();
  const table = 'marketing_memory_records';
  const rollbackProbe = new Error('CROSS_TENANT_PROBE_ROLLBACK');

  try {
    await client.begin(async (tx) => {
      // Seed synthetic tenant parents as the (owner) connection before dropping
      // privileges. Both inserts roll back with the transaction.
      await tx.unsafe(
        `INSERT INTO tenants (id, name) VALUES ($1::uuid, $2), ($3::uuid, $4)`,
        [probeTenantA, `ws-prod-02-probe-a-${probeId}`, probeTenantB, `ws-prod-02-probe-b-${probeId}`],
      );

      await tx.unsafe(`SET LOCAL ROLE ${quoteIdentifier(appRole)}`);

      // Tenant A context: write a fixture row and confirm own-tenant visibility.
      await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [probeTenantA]);
      await tx.unsafe(
        `INSERT INTO ${table} (id, tenant_id, scope, scope_id, statement)
         VALUES ($1::uuid, $2::uuid, 'ws-prod-02-probe', $3::uuid, $4)`,
        [probeId, probeTenantA, randomUUID(), 'probe fixture (rolled back)'],
      );
      const ownVisible = rows(await tx.unsafe(`SELECT 1 AS one FROM ${table} WHERE id = $1::uuid`, [probeId]));
      if (ownVisible.length !== 1) throw new Error('PROBE_SANITY_OWN_TENANT_FAILED');

      // Tenant B context: tenant A's row must be invisible.
      await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [probeTenantB]);
      const crossVisible = rows(await tx.unsafe(`SELECT 1 AS one FROM ${table} WHERE id = $1::uuid`, [probeId]));
      if (crossVisible.length !== 0) throw new Error('CROSS_TENANT_SELECT_ISOLATION_BROKEN');

      const updated = rows(
        await tx.unsafe(
          `UPDATE ${table} SET statement = 'cross-tenant update (must be denied)'
           WHERE id = $1::uuid RETURNING id`,
          [probeId],
        ),
      );
      if (updated.length !== 0) throw new Error('CROSS_TENANT_UPDATE_ISOLATION_BROKEN');

      const deleted = rows(await tx.unsafe(`DELETE FROM ${table} WHERE id = $1::uuid RETURNING id`, [probeId]));
      if (deleted.length !== 0) throw new Error('CROSS_TENANT_DELETE_ISOLATION_BROKEN');

      // postgres.js must own the savepoint so its transaction state is recovered
      // when the expected RLS violation rejects the statement.
      let insertError: unknown;
      try {
        await tx.savepoint(async (savepoint) => {
          await savepoint.unsafe(
            `INSERT INTO ${table} (id, tenant_id, scope, scope_id, statement)
             VALUES ($1::uuid, $2::uuid, 'ws-prod-02-probe', $3::uuid, $4)`,
            [randomUUID(), probeTenantA, randomUUID(), 'cross-tenant insert (must be denied)'],
          );
        });
      } catch (error) {
        insertError = error;
      }
      if (!isExpectedRlsInsertDenial(insertError)) {
        throw insertError ?? new Error('CROSS_TENANT_INSERT_ISOLATION_BROKEN');
      }

      await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [probeTenantA]);
      const intact = rows(
        await tx.unsafe(`SELECT statement FROM ${table} WHERE id = $1::uuid`, [probeId]),
      );
      if (intact.length !== 1 || intact[0]?.statement !== 'probe fixture (rolled back)') {
        throw new Error('PROBE_SANITY_OWN_TENANT_MUTATED');
      }
      throw rollbackProbe;
    });
  } catch (error) {
    if (error !== rollbackProbe) throw error;
  }

  return {
    table,
    selectIsolation: true,
    insertIsolation: true,
    updateIsolation: true,
    deleteIsolation: true,
  };
}
