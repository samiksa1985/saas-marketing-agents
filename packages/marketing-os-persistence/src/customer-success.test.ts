import test from 'node:test';
import * as assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  PersistentCustomerSuccessStore,
} from './customer-success.js';

const context = {
  tenantId: 'tenant-a',
  roles: [],
  permissions: [],
  locale: 'en',
} as TenantContext;

test(
  'customer health read rejects cross tenant before DB access',
  async () => {
    const store =
      new PersistentCustomerSuccessStore(
        {} as never,
      );

    await assert.rejects(
      store.getLatestHealth(
        context,
        'tenant-b',
        'customer-1',
      ),
      /TENANT_SCOPE_DENIED/,
    );
  },
);

test(
  'customer health save rejects cross tenant before DB access',
  async () => {
    const store =
      new PersistentCustomerSuccessStore(
        {} as never,
      );

    await assert.rejects(
      store.saveHealth(
        context,
        {
          id: 'health-1',
          tenantId: 'tenant-b',
          customerId: 'customer-1',
          score: 90,
          status: 'HEALTHY',
          churnRisk: 'LOW',
          causes: [],
          actions: [],
          evidenceIds: [],
          confidence: 100,
          model:
            'canonical-customer-health-v1',
          assessedAt:
            new Date().toISOString(),
        },
      ),
      /TENANT_SCOPE_DENIED/,
    );
  },
);
