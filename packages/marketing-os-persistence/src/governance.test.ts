import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  GovernanceAuditEvent,
  GovernanceFeatureFlag,
  TenantContext,
} from '@platform/contracts';

import { GovernanceStore, type GovernancePersistenceDatabase } from './governance.js';

class RecordingDatabase implements GovernancePersistenceDatabase {
  public readonly queries: unknown[] = [];

  async execute(query: unknown): Promise<unknown[]> {
    this.queries.push(query);
    return [];
  }
}

const context: TenantContext = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  roles: ['tenant_admin'],
  permissions: ['organization:manage'],
  locale: 'en',
};

test('governance persistence rejects cross-tenant writes before database access', async () => {
  const database = new RecordingDatabase();
  const store = new GovernanceStore(database);
  const flag: GovernanceFeatureFlag = {
    id: 'flag-a',
    tenantId: 'tenant-b',
    key: 'governance.beta',
    enabled: true,
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  };

  await assert.rejects(() => store.saveFeatureFlag(context, flag), /cross-tenant/i);
  assert.equal(database.queries.length, 0);
});

test('governance audit persistence exposes append and list only', async () => {
  const database = new RecordingDatabase();
  const store = new GovernanceStore(database);
  const event: GovernanceAuditEvent = {
    id: 'event-a',
    tenantId: 'tenant-a',
    type: 'governance.feature_flag.updated',
    actorType: 'user',
    actorId: 'user-a',
    correlationId: 'flag-a',
    occurredAt: '2026-09-03T00:00:00.000Z',
    payload: { enabled: true },
  };

  await store.appendAuditEvent(context, event);
  await store.listAuditEvents(context);
  assert.equal(database.queries.length, 2);
  assert.equal('updateAuditEvent' in store, false);
  assert.equal('deleteAuditEvent' in store, false);
});
