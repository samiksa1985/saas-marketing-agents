import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildForecast,
  draftProposal,
  scoreLead,
} from './index.js';

test('scores a high-intent qualified lead as HOT', () => {
  const result = scoreLead({
    leadId: 'lead-1',
    companyName: 'Acme',
    industry: 'Technology',
    budget: '100000',
    email: 'buyer@example.com',
    phone: '+966500000000',
    source: 'website',
    notes: 'Customer requested a quote and wants to buy.',
  });

  assert.equal(result.leadId, 'lead-1');
  assert.equal(result.temperature, 'HOT');
  assert.ok(result.score >= 80);
  assert.equal(result.model, 'canonical-sales-score-v1');
});

test('scores a low-signal lead below HOT', () => {
  const result = scoreLead({
    companyName: 'Acme',
  });

  assert.ok(result.score < 80);
  assert.notEqual(result.temperature, 'HOT');
});

test('builds weighted sales forecast from canonical opportunities', () => {
  const result = buildForecast({
    period: 'MONTH',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-31T23:59:59.999Z',
    opportunities: [
      {
        id: 'opp-1',
        tenantId: 'tenant-1',
        name: 'Enterprise Deal',
        stage: 'proposal',
        amount: 100000,
        currency: 'SAR',
        expectedCloseAt: '2026-08-20T00:00:00.000Z',
      },
      {
        id: 'opp-2',
        tenantId: 'tenant-1',
        name: 'Discovery Deal',
        stage: 'qualified',
        amount: 50000,
        currency: 'SAR',
        expectedCloseAt: '2026-08-25T00:00:00.000Z',
      },
    ],
  });

  assert.equal(result.opportunityCount, 2);
  assert.equal(result.pipelineAmount, 150000);
  assert.equal(result.weightedAmount, 77500);
  assert.deepEqual(result.opportunityIds, ['opp-1', 'opp-2']);
  assert.ok(result.winProbability > 0);
});

test('excludes opportunities outside forecast period', () => {
  const result = buildForecast({
    period: 'MONTH',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-31T23:59:59.999Z',
    opportunities: [
      {
        id: 'opp-outside',
        tenantId: 'tenant-1',
        name: 'Future Deal',
        stage: 'proposal',
        amount: 200000,
        currency: 'SAR',
        expectedCloseAt: '2026-09-15T00:00:00.000Z',
      },
    ],
  });

  assert.equal(result.opportunityCount, 0);
  assert.equal(result.pipelineAmount, 0);
  assert.equal(result.weightedAmount, 0);
});

test('drafts proposal as approval-governed artifact', () => {
  const proposal = draftProposal({
    id: 'proposal-1',
    tenantId: 'tenant-1',
    customerName: 'Acme',
    problemStatement: 'Customer needs more qualified pipeline.',
    proposedScope: ['Lead intelligence', 'Campaign optimization'],
    opportunity: {
      id: 'opp-1',
      tenantId: 'tenant-1',
      name: 'Growth Program',
      stage: 'proposal',
      amount: 250000,
      currency: 'SAR',
    },
  });

  assert.equal(proposal.status, 'DRAFT');
  assert.equal(proposal.requiresApproval, true);
  assert.equal(proposal.tenantId, 'tenant-1');
  assert.equal(proposal.opportunityId, 'opp-1');
  assert.equal(proposal.amount, 250000);
});

test('rejects cross-tenant proposal drafting', () => {
  assert.throws(
    () =>
      draftProposal({
        id: 'proposal-1',
        tenantId: 'tenant-A',
        opportunity: {
          id: 'opp-1',
          tenantId: 'tenant-B',
          name: 'Cross Tenant Deal',
          stage: 'proposal',
        },
      }),
    /Tenant mismatch/,
  );
});
