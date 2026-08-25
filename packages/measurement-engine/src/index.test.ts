import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFunnelSnapshot, generateGrowthInsights } from './index.js';

test('measurement converts events into a revenue-oriented funnel', () => {
  const events = [
    {id:'a',tenantId:'t',type:'activity',value:100,metric:'count',occurredAt:'',sourceEntityId:'x',attributes:{}},
    {id:'l',tenantId:'t',type:'lead',value:10,metric:'count',occurredAt:'',sourceEntityId:'x',attributes:{}},
    {id:'q',tenantId:'t',type:'qualified_lead',value:3,metric:'count',occurredAt:'',sourceEntityId:'x',attributes:{}},
    {id:'r',tenantId:'t',type:'revenue',value:50000,metric:'sar',occurredAt:'',sourceEntityId:'x',attributes:{}},
  ] as const;
  const funnel = buildFunnelSnapshot([...events]);
  assert.equal(funnel.activities,100);
  assert.equal(funnel.leads,10);
  assert.equal(funnel.qualifiedLeads,3);
  assert.equal(funnel.revenue,50000);
});

test('growth insights identify funnel bottlenecks', () => {
  const events = [
    {id:'l1',tenantId:'t',type:'lead',value:5,metric:'count',occurredAt:'',sourceEntityId:'x',attributes:{}},
  ] as const;
  const insights = generateGrowthInsights([...events]);
  assert.equal(insights[0]?.title, 'Qualification bottleneck');
  assert.ok(insights[0]?.evidenceEventIds.includes('l1'));
});
