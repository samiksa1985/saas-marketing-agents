import test from 'node:test';
import * as assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  assessCustomerHealth,
  assessExpansionOpportunity,
  recommendRenewal,
} from './index.js';

const context = {
  tenantId: 'tenant-a',
  roles: [],
  permissions: [],
  locale: 'en',
} as TenantContext;

test(
  'healthy customer receives strong health assessment',
  () => {
    const result = assessCustomerHealth(
      context,
      {
        tenantId: 'tenant-a',
        customerId: 'customer-1',
        engagementScore: 90,
        deliveryScore: 90,
        outcomeScore: 90,
        satisfactionScore: 90,
        unresolvedIssues: 0,
        usageScore: 90,
        evidenceIds: ['e1'],
        assessedAt: '2026-08-30T00:00:00.000Z',
      },
    );

    assert.equal(result.score, 90);
    assert.equal(result.status, 'HEALTHY');
    assert.equal(result.churnRisk, 'LOW');
  },
);

test(
  'unresolved issues reduce health score',
  () => {
    const result = assessCustomerHealth(
      context,
      {
        tenantId: 'tenant-a',
        customerId: 'customer-1',
        engagementScore: 70,
        deliveryScore: 70,
        outcomeScore: 70,
        satisfactionScore: 70,
        unresolvedIssues: 5,
        assessedAt: '2026-08-30T00:00:00.000Z',
      },
    );

    assert.equal(result.score, 50);
    assert.equal(result.status, 'AT_RISK');
  },
);

test(
  'renewal risk produces recovery recommendation',
  () => {
    const health = assessCustomerHealth(
      context,
      {
        tenantId: 'tenant-a',
        customerId: 'customer-1',
        engagementScore: 60,
        deliveryScore: 55,
        outcomeScore: 55,
        satisfactionScore: 60,
        unresolvedIssues: 1,
        daysToRenewal: 20,
        assessedAt: '2026-08-30T00:00:00.000Z',
      },
    );

    const renewal =
      recommendRenewal(
        context,
        health,
        20,
      );

    assert.equal(
      renewal.requiresApproval,
      true,
    );

    assert.notEqual(
      renewal.recommendation,
      'RENEW',
    );
  },
);

test(
  'healthy customer can qualify for expansion',
  () => {
    const health = assessCustomerHealth(
      context,
      {
        tenantId: 'tenant-a',
        customerId: 'customer-1',
        engagementScore: 90,
        deliveryScore: 90,
        outcomeScore: 90,
        satisfactionScore: 90,
        unresolvedIssues: 0,
        assessedAt: '2026-08-30T00:00:00.000Z',
      },
    );

    const expansion =
      assessExpansionOpportunity(
        context,
        health,
        90,
        90,
      );

    assert.equal(
      expansion.eligible,
      true,
    );

    assert.equal(
      expansion.requiresApproval,
      true,
    );
  },
);

test(
  'cross tenant customer assessment is rejected',
  () => {
    assert.throws(
      () =>
        assessCustomerHealth(
          context,
          {
            tenantId: 'tenant-b',
            customerId: 'customer-1',
            engagementScore: 90,
            deliveryScore: 90,
            outcomeScore: 90,
            satisfactionScore: 90,
            unresolvedIssues: 0,
          },
        ),
      /TENANT_SCOPE_DENIED/,
    );
  },
);
