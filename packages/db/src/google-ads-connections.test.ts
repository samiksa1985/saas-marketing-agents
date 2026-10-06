/**
 * WS-PROD-09 real-PostgreSQL proof for Google Ads connection persistence:
 * tenant RLS, runtime DML allowlist, and account-mapping boundaries on the
 * actual codecore_app role. Synthetic fixtures only; cleaned up.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import postgres from 'postgres';

import { sharedTestAppPassword } from './test-app-password.js';

function resolvePilotDatabaseUrl(): string | undefined {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) return envUrl;
  try {
    const passwordFile = join(homedir(), '.nawa-secrets', 'phase1-postgres-password.txt');
    const password = readFileSync(passwordFile, 'utf8').trim();
    if (!password) return undefined;
    return `postgresql://phase1_owner:${encodeURIComponent(password)}@127.0.0.1:55432/ai_marketing_phase1`;
  } catch {
    return undefined;
  }
}

const ownerUrl = resolvePilotDatabaseUrl();
const skipReason = 'Growth pilot unavailable (DATABASE_URL unset and no local pilot secret file)';

function appUrl(): string {
  const url = new URL(ownerUrl!);
  url.username = 'codecore_app';
  url.password = sharedTestAppPassword();
  return url.toString();
}

test(
  'Google Ads connections are tenant-isolated and runtime DML works under allowlist',
  { skip: !ownerUrl && skipReason, timeout: 120_000 },
  async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const owner = postgres(ownerUrl!, { max: 1, prepare: false });
    const app = postgres(appUrl(), { max: 2, prepare: false });
    try {
      await owner.unsafe(
        `INSERT INTO tenants(id, name) VALUES ($1::uuid, $2), ($3::uuid, $4)`,
        [tenantA, `WS09 synthetic A ${tenantA}`, tenantB, `WS09 synthetic B ${tenantB}`],
      );

      // Runtime DML within authoritative tenant scope succeeds.
      const inserted = await app.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
        return tx.unsafe(
          `INSERT INTO google_ads_connections (tenant_id, idempotency_key, oauth_state_hash, oauth_state_expires_at)
           VALUES ($1::uuid, $2, $3, now() + interval '10 minutes') RETURNING id::text AS id`,
          [tenantA, `ws09-${randomUUID()}`, 'a'.repeat(64)],
        );
      });
      assert.equal(inserted.length, 1);
      const connectionId = String(inserted[0]!.id);

      await app.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
        await tx.unsafe(
          `INSERT INTO google_ads_account_mappings (tenant_id, connection_id, customer_id, is_manager)
           VALUES ($1::uuid, $2::uuid, '1234567890', false)`,
          [tenantA, connectionId],
        );
      });

      // Tenant A sees its connection; tenant B sees nothing.
      const visibleA = await app.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
        return tx.unsafe(`SELECT count(*)::int AS c FROM google_ads_connections WHERE id = $1::uuid`, [connectionId]);
      });
      assert.equal(visibleA[0]?.c, 1);
      const visibleB = await app.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [tenantB]);
        return tx.unsafe(`SELECT count(*)::int AS c FROM google_ads_connections WHERE id = $1::uuid`, [connectionId]);
      });
      assert.equal(visibleB[0]?.c, 0, 'cross-tenant connection must be invisible');

      // Cross-tenant write touches zero rows under RLS (the row is invisible
      // to tenant B, so UPDATE affects nothing and cannot error).
      const crossUpdate = await app.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [tenantB]);
        return tx.unsafe(
          `UPDATE google_ads_connections SET status = 'DISCONNECTED' WHERE id = $1::uuid RETURNING id`,
          [connectionId],
        );
      });
      assert.equal(crossUpdate.length, 0, 'cross-tenant update must affect zero rows');

      // The row remains intact for tenant A.
      const intact = await app.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
        return tx.unsafe(`SELECT status FROM google_ads_connections WHERE id = $1::uuid`, [connectionId]);
      });
      assert.equal(String(intact[0]?.status), 'PENDING');

      console.log('WS09_DB_EVIDENCE={"rls":true,"dmlAllowlist":true,"crossTenantDenied":true}');
    } finally {
      await owner.unsafe(`DELETE FROM google_ads_connections WHERE tenant_id IN ($1::uuid, $2::uuid)`, [tenantA, tenantB]);
      await owner.unsafe(`DELETE FROM tenants WHERE id IN ($1::uuid, $2::uuid)`, [tenantA, tenantB]);
      await app.end();
      await owner.end();
    }
  },
);
