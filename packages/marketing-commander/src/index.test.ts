import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketingCommanderPlan, inferObjective } from './index.js';

const registry = {
  domainLeaders: [
    'business-intelligence','market-research','marketing-strategist','content','campaign',
    'seo','analytics','sales','customer-success','cfo-intelligence','automation','ai-orchestrator'
  ].map((id) => ({id, name:id, tier:'DOMAIN_LEADER', source:'project2', mission:id, consolidationStatus:'KEEP_AS_DOMAIN_LEADER', reviewNote:''})),
  specialists: [
    {id:'sales-outbound-strategist', name:'Sales Outbound Strategist'},
    {id:'abm-strategist', name:'ABM Strategist'},
    {id:'analytics-marketing-ops-architect', name:'Analytics Marketing Ops Architect'},
    {id:'content-copywriter', name:'Content Copywriter'},
    {id:'seo-strategist', name:'SEO Strategist'},
    {id:'social-media-strategist', name:'Social Media Strategist'},
  ],
};

test('objective inference routes common customer-acquisition goals', () => {
  assert.equal(inferObjective({tenantId:'t', goal:'Generate qualified leads and pipeline'}), 'generate_leads');
  assert.equal(inferObjective({tenantId:'t', goal:'Launch a campaign'}), 'launch_campaign');
  assert.equal(inferObjective({tenantId:'t', goal:'Improve conversion rate'}), 'improve_conversion');
});

test('commander plan is outcome-first and approval-gated', () => {
  const plan = buildMarketingCommanderPlan(
    {tenantId:'t', goal:'Generate qualified leads and pipeline', targetAudience:['B2B']},
    registry,
  );
  assert.equal(plan.objective, 'generate_leads');
  assert.ok(plan.domainLeaders.some((x) => x.id === 'sales'));
  assert.ok(plan.workstreams.some((x) => x.id === '08'));
  assert.ok(plan.sequence.length >= 3);
  assert.equal(plan.governance.requiresHumanApproval, true);
  assert.equal(plan.governance.externalExecutionBlockedUntilApproval, true);
});

test('commander surfaces unresolved inputs instead of inventing facts', () => {
  const plan = buildMarketingCommanderPlan(
    {tenantId:'t', goal:'Generate leads'},
    registry,
  );
  assert.ok(plan.needsInput.some((x) => x.includes('business context')));
  assert.ok(plan.needsInput.some((x) => x.includes('target audience')));
});
