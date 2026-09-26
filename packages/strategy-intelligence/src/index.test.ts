import test from 'node:test';
import * as assert from 'node:assert/strict';

import type {
  StrategyBuildInput,
} from './index.js';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  buildMarketingStrategy,
  createNextStrategyVersion,
  prioritizeStrategyRoadmap,
} from './index.js';

const context = {
  tenantId: 'tenant-a',
  roles: [],
  permissions: [],
  locale: 'en',
} as TenantContext;

function strategyInput(): StrategyBuildInput {
  return {
    id: 'strategy-1',
    tenantId: 'tenant-a',
    title: 'Growth Strategy',
    executiveSummary:
      'Build qualified pipeline with focused positioning.',
    objectiveIds: ['goal-1'],
    objectives: [
      {
        id: 'objective-1',
        name: 'Qualified pipeline',
        description:
          'Increase qualified pipeline.',
        metric: 'qualified_pipeline',
        priority: 'HIGH',
      },
    ],
    icpIds: ['icp-1'],
    positioning:
      'Fast evidence-driven AI marketing execution.',
    messaging: [
      'Evidence-driven growth.',
    ],
    channels: [
      {
        name: 'LinkedIn',
        objective: 'Generate qualified demand',
        kpi: 'qualified_leads',
        priority: 'HIGH',
      },
    ],
    offers: [
      'Marketing intelligence assessment',
    ],
    campaigns: [
      {
        name: 'Demand Campaign',
        objective:
          'Generate qualified pipeline',
        priority: 'HIGH',
        rationale:
          'Aligned with ICP and demand signals.',
        evidenceIds: ['evidence-1'],
      },
    ],
    contentPillars: [
      'AI marketing',
      'Revenue growth',
    ],
    kpis: [
      {
        name: 'Qualified leads',
        metric: 'qualified_leads',
        timeframe: '90d',
      },
    ],
    roadmap: [
      {
        id: 'roadmap-30',
        horizon: '30',
        title: 'Positioning foundation',
        objective:
          'Validate positioning and messaging',
        owner: 'marketing-strategist',
        priority: 'CRITICAL',
        dependencies: [],
        evidenceIds: ['evidence-1'],
      },
      {
        id: 'roadmap-60',
        horizon: '60',
        title: 'Demand activation',
        objective:
          'Activate demand channels',
        owner: 'campaign',
        priority: 'HIGH',
        dependencies: ['roadmap-30'],
        evidenceIds: ['evidence-1'],
      },
      {
        id: 'roadmap-90',
        horizon: '90',
        title: 'Optimization',
        objective:
          'Optimize based on evidence',
        owner: 'analytics',
        priority: 'MEDIUM',
        dependencies: ['roadmap-60'],
        evidenceIds: ['evidence-1'],
      },
    ],
    priorities: [
      'Positioning',
      'Pipeline',
    ],
    assumptions: [
      'Approved ICP remains current.',
    ],
    evidenceIds: ['evidence-1'],
    evidenceConfidence: [90],
  };
}

test('builds canonical approval-gated marketing strategy', () => {
  const strategy =
    buildMarketingStrategy(
      context,
      strategyInput(),
    );

  assert.equal(strategy.version, 1);
  assert.equal(strategy.status, 'DRAFT');
  assert.equal(
    strategy.requiresApproval,
    true,
  );
  assert.ok(strategy.confidence > 0);
  assert.equal(strategy.roadmap.length, 3);
});

test('rejects cross-tenant strategy generation', () => {
  assert.throws(
    () =>
      buildMarketingStrategy(
        context,
        {
          ...strategyInput(),
          tenantId: 'tenant-b',
        },
      ),
    /TENANT_SCOPE_DENIED/,
  );
});

test('rejects unknown roadmap dependency', () => {
  const input = strategyInput();

  input.roadmap[1] = {
    ...input.roadmap[1]!,
    dependencies: ['missing-step'],
  };

  assert.throws(
    () =>
      buildMarketingStrategy(
        context,
        input,
      ),
    /UNKNOWN_STRATEGY_ROADMAP_DEPENDENCY/,
  );
});

test('prioritizes critical 30 day strategy work', () => {
  const input = strategyInput();

  const ranked =
    prioritizeStrategyRoadmap(
      context,
      'tenant-a',
      [...input.roadmap].reverse(),
    );

  assert.equal(
    ranked[0]?.id,
    'roadmap-30',
  );
});

test('creates strategy version without overwriting prior version', () => {
  const first =
    buildMarketingStrategy(
      context,
      strategyInput(),
    );

  const next =
    createNextStrategyVersion(
      context,
      first,
      {
        ...strategyInput(),
        id: 'strategy-2',
        title: 'Growth Strategy V2',
      },
    );

  assert.equal(next.version, 2);
  assert.equal(next.status, 'DRAFT');
  assert.equal(
    first.version,
    1,
  );
});
