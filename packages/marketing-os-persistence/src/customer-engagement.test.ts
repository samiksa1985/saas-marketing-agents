import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantContext } from '@platform/contracts';

import { PersistentCustomerEngagementStore } from './customer-engagement.js';

test('customer engagement persistence rejects missing or mismatched tenant context before accessing the database', async () => {
  const store = new PersistentCustomerEngagementStore({} as never);
  const missing: TenantContext = { tenantId: '', roles: [], permissions: [], locale: 'en' };
  const tenantA: TenantContext = { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' };

  await assert.rejects(store.listConversations(missing), /TENANT_SCOPE_DENIED/);
  await assert.rejects(
    store.saveConversationEvent(tenantA, {
      eventId: 'event-b',
      conversationId: 'conversation-b',
      tenantId: 'tenant-b',
      provider: 'CUSTOM',
      channel: 'WEB_CHAT',
      direction: 'INBOUND',
      participantIdentityIds: [],
      occurredAt: '2026-09-15T00:00:00.000Z',
      contentHash: 'hash-only',
      consentStatus: 'ALLOWED',
      languageHints: ['ar-SA', 'en'],
      evidenceRefs: [],
      idempotencyKey: 'event-b',
      createdAt: '2026-09-15T00:00:00.000Z',
    }),
    /TENANT_SCOPE_DENIED/,
  );
});
