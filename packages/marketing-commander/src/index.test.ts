import test from 'node:test';
import assert from 'node:assert/strict';
import type { CanonicalAgentRecord } from '@platform/contracts';
import {
  buildMarketingCommanderPlan,
  inferObjective,
} from './index.js';

const domainLeaders: CanonicalAgentRecord[] = [
  'business-intelligence',
  'market-research',
  'marketing-strategist',
  'content',
  'campaign',
  'seo',
  'analytics',
  'sales',
  'customer-success',
  'cfo-intelligence',
  'automation',
  'ai-orchestrator',
].map((id) => ({
  id,
  name: id,
  tier: 'DOMAIN_LEADER',
  source: 'project2',
  mission: id,
  consolidationStatus: 'KEEP_AS_DOMAIN_LEADER',
  reviewNote: '',
}));

const registry = {
  domainLeaders,
  specialists: [
    {
      id: 'sales-outbound-strategist',
      name: 'Sales Outbound Strategist',
    },
    {
      id: 'abm-strategist',
      name: 'ABM Strategist',
    },
    {
      id: 'analytics-marketing-ops-architect',
      name: 'Analytics Marketing Ops Architect',
    },
    {
      id: 'content-copywriter',
      name: 'Content Copywriter',
    },
    {
      id: 'seo-strategist',
      name: 'SEO Strategist',
    },
    {
      id: 'social-media-strategist',
      name: 'Social Media Strategist',
    },
  ],
};

test(
  'objective inference routes common customer-acquisition goals',
  () => {
    assert.equal(
      inferObjective({
        tenantId: 't',
        goal: 'Generate qualified leads and pipeline',
      }),
      'generate_leads',
    );

    assert.equal(
      inferObjective({
        tenantId: 't',
        goal: 'Launch a campaign',
      }),
      'launch_campaign',
    );

    assert.equal(
      inferObjective({
        tenantId: 't',
        goal: 'Improve conversion rate',
      }),
      'improve_conversion',
    );
  },
);

test(
  'commander plan is outcome-first and approval-gated',
  () => {
    const plan = buildMarketingCommanderPlan(
      {
        tenantId: 't',
        goal: 'Generate qualified leads and pipeline',
        targetAudience: ['B2B'],
        timeframe: '90d',
        contextSummary: 'B2B technology company context',
      },
      registry,
    );

    assert.equal(
      plan.objective,
      'generate_leads',
    );
    assert.ok(
      plan.domainLeaders.some(
        (item) => item.id === 'sales',
      ),
    );
    assert.ok(
      plan.workstreams.some(
        (item) => item.id === '08',
      ),
    );
    assert.ok(
      plan.sequence.length >= 3,
    );
    assert.equal(
      plan.governance.requiresHumanApproval,
      true,
    );
    assert.equal(
      plan.governance
        .externalExecutionBlockedUntilApproval,
      true,
    );
  },
);

test(
  'commander surfaces unresolved inputs instead of inventing facts',
  () => {
    const plan = buildMarketingCommanderPlan(
      {
        tenantId: 't',
        goal: 'Generate leads',
      },
      registry,
    );

    assert.ok(
      plan.needsInput.some((item) =>
        item.includes('business context'),
      ),
    );
    assert.ok(
      plan.needsInput.some((item) =>
        item.includes('target audience'),
      ),
    );
  },
);