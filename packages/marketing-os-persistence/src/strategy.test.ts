import test from 'node:test';
import * as assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  PersistentMarketingStrategyStore,
} from './strategy.js';

const context = {
  tenantId: 'tenant-a',
  roles: [],
  permissions: [],
  locale: 'en',
} as TenantContext;

test(
  'strategy latest rejects cross tenant before database access',
  async () => {
    const store =
      new PersistentMarketingStrategyStore(
        {} as never,
      );

    await assert.rejects(
      store.getLatest(
        context,
        'tenant-b',
        'strategy-1',
      ),
      /TENANT_SCOPE_DENIED/,
    );
  },
);

test(
  'strategy versions reject cross tenant before database access',
  async () => {
    const store =
      new PersistentMarketingStrategyStore(
        {} as never,
      );

    await assert.rejects(
      store.listVersions(
        context,
        'tenant-b',
        'strategy-1',
      ),
      /TENANT_SCOPE_DENIED/,
    );
  },
);

test(
  'strategy save rejects cross tenant before database access',
  async () => {
    const store =
      new PersistentMarketingStrategyStore(
        {} as never,
      );

    await assert.rejects(
      store.save(
        context,
        {
          id:
            'strategy-1',
          tenantId:
            'tenant-b',
          version: 1,
          title:
            'Strategy',
          executiveSummary:
            'Summary',
          objectiveIds: [],
          objectives: [],
          icpIds: [],
          positioning:
            'Position',
          messaging: [],
          channels: [],
          offers: [],
          campaigns: [],
          contentPillars: [],
          kpis: [],
          roadmap: [],
          priorities: [],
          assumptions: [],
          evidenceIds: [],
          confidence: 0,
          status: 'DRAFT',
          requiresApproval: true,
          createdAt:
            new Date().toISOString(),
          updatedAt:
            new Date().toISOString(),
        },
      ),
      /TENANT_SCOPE_DENIED/,
    );
  },
);
