/**
 * Real PostgreSQL cross-tenant isolation probe (WS-PROD-02).
 *
 * The behavioral probe exercises the ACTUAL runtime authority path: an
 * unprivileged codecore_app connection performs all SELECT/INSERT/UPDATE/DELETE
 * attempts. Synthetic tenant fixtures are seeded and cleaned up by an optional
 * privileged seedClient (e.g. the migration/owner connection). When seedClient is
 * omitted, the probe falls back to a single-transaction SET LOCAL ROLE path for
 * lightweight unit tests.
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

const ROLLBACK_PROBE = new Error('CROSS_TENANT_PROBE_ROLLBACK');

async function seedProbeTenants(
  client: ProbeClient,
  probeTenantA: string,
  probeTenantB: string,
  probeId: string,
): Promise<void> {
  await client.begin(async (tx) => {
    await tx.unsafe(
      `INSERT INTO tenants (id, name) VALUES ($1::uuid, $2), ($3::uuid, $4)`,
      [probeTenantA, `ws-prod-02-probe-a-${probeId}`, probeTenantB, `ws-prod-02-probe-b-${probeId}`],
    );
  });
}

async function cleanupProbeTenants(client: ProbeClient, probeTenantA: string, probeTenantB: string): Promise<void> {
  await client.begin(async (tx) => {
    await tx.unsafe(`DELETE FROM tenants WHERE id IN ($1::uuid, $2::uuid)`, [probeTenantA, probeTenantB]);
  });
}

async function runProbeBody(
  tx: ProbeTransaction,
  probeId: string,
  probeTenantA: string,
  probeTenantB: string,
): Promise<void> {
  // The probe table is part of the CC-RR-002 operational DML allowlist so the
  // runtime identity reaches the RLS policy rather than a grant denial.
  const table = 'codecore_workflow_executions';

  // Tenant A context: write a fixture row and confirm own-tenant visibility.
  await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [probeTenantA]);
  await tx.unsafe(
    `INSERT INTO ${table} (id, tenant_id, workflow_id, workflow_type, idempotency_key)
     VALUES ($1::uuid, $2::uuid, $3, 'ws-prod-probe', $4)`,
    [probeId, probeTenantA, `probe-${probeId}`, `probe-${randomUUID()}`],
  );
  const ownVisible = rows(await tx.unsafe(`SELECT 1 AS one FROM ${table} WHERE id = $1::uuid`, [probeId]));
  if (ownVisible.length !== 1) throw new Error('PROBE_SANITY_OWN_TENANT_FAILED');

  // Tenant B context: tenant A's row must be invisible.
  await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [probeTenantB]);
  const crossVisible = rows(await tx.unsafe(`SELECT 1 AS one FROM ${table} WHERE id = $1::uuid`, [probeId]));
  if (crossVisible.length !== 0) throw new Error('CROSS_TENANT_SELECT_ISOLATION_BROKEN');

  const updated = rows(
    await tx.unsafe(
      `UPDATE ${table} SET workflow_type = 'cross-tenant update (must be denied)'
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
        `INSERT INTO ${table} (id, tenant_id, workflow_id, workflow_type, idempotency_key)
         VALUES ($1::uuid, $2::uuid, $3, 'ws-prod-probe', $4)`,
        [randomUUID(), probeTenantA, `probe-${randomUUID()}`, `probe-${randomUUID()}`],
      );
    });
  } catch (error) {
    insertError = error;
  }
  if (!isExpectedRlsInsertDenial(insertError)) {
    throw insertError ?? new Error('CROSS_TENANT_INSERT_ISOLATION_BROKEN');
  }

  await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [probeTenantA]);
  const intact = rows(await tx.unsafe(`SELECT workflow_type FROM ${table} WHERE id = $1::uuid`, [probeId]));
  if (intact.length !== 1 || intact[0]?.workflow_type !== 'ws-prod-probe') {
    throw new Error('PROBE_SANITY_OWN_TENANT_MUTATED');
  }
  throw ROLLBACK_PROBE;
}

export async function runCrossTenantProbe(
  client: ProbeClient,
  options: { appRole?: string; seedClient?: ProbeClient } = {},
): Promise<CrossTenantProbeResult> {
  const appRole = options.appRole ?? 'codecore_app';
  const probeId = randomUUID();
  const probeTenantA = randomUUID();
  const probeTenantB = randomUUID();
  const table = 'codecore_workflow_executions';

  if (options.seedClient) {
    await seedProbeTenants(options.seedClient, probeTenantA, probeTenantB, probeId);
    try {
      await client.begin(async (tx) => {
        await runProbeBody(tx, probeId, probeTenantA, probeTenantB);
      });
    } catch (error) {
      if (error !== ROLLBACK_PROBE) throw error;
    } finally {
      await cleanupProbeTenants(options.seedClient, probeTenantA, probeTenantB);
    }
  } else {
    // Lightweight unit-test path: keep everything inside one rolled-back
    // transaction and use SET LOCAL ROLE to exercise the runtime authority.
    try {
      await client.begin(async (tx) => {
        await tx.unsafe(
          `INSERT INTO tenants (id, name) VALUES ($1::uuid, $2), ($3::uuid, $4)`,
          [probeTenantA, `ws-prod-02-probe-a-${probeId}`, probeTenantB, `ws-prod-02-probe-b-${probeId}`],
        );
        await tx.unsafe(`SET LOCAL ROLE ${quoteIdentifier(appRole)}`);
        await runProbeBody(tx, probeId, probeTenantA, probeTenantB);
      });
    } catch (error) {
      if (error !== ROLLBACK_PROBE) throw error;
    }
  }

  return {
    table,
    selectIsolation: true,
    insertIsolation: true,
    updateIsolation: true,
    deleteIsolation: true,
  };
}
