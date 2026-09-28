import test from 'node:test';
import assert from 'node:assert/strict';
import { AcquisitionGraph } from './index.js';

test('acquisition graph models the full revenue journey', () => {
  const graph = new AcquisitionGraph();
  const nodes = [
    ['company-1','company'],
    ['account-1','account'],
    ['contact-1','contact'],
    ['signal-1','signal'],
    ['intent-1','intent'],
    ['campaign-1','campaign'],
    ['interaction-1','interaction'],
    ['lead-1','lead'],
    ['opp-1','opportunity'],
    ['customer-1','customer'],
    ['revenue-1','revenue'],
  ] as const;

  for (const [id, type] of nodes) {
    graph.upsertNode({ id, tenantId:'tenant-a', type, label:id, attributes:{}, evidenceIds:[] });
  }

  const links: Array<[string,string,string]> = [
    ['account-1','company-1','belongs_to'],
    ['contact-1','account-1','contacts'],
    ['signal-1','account-1','triggered'],
    ['intent-1','signal-1','indicates'],
    ['campaign-1','account-1','targeted_by'],
    ['interaction-1','campaign-1','engaged_with'],
    ['lead-1','interaction-1','converted_to'],
    ['opp-1','lead-1','advanced_to'],
    ['customer-1','opp-1','converted_to'],
    ['revenue-1','customer-1','generated'],
  ];

  for (const [fromId, toId, type] of links) {
    graph.addEdge({
      id: `${fromId}:${type}:${toId}`,
      tenantId:'tenant-a',
      fromId,
      toId,
      type: type as never,
      evidenceIds:[],
    });
  }

  const path = graph.path('signal-1','revenue-1')[0];
  assert.ok(path?.includes('revenue-1'));
  assert.equal(graph.snapshot('tenant-a').nodes.length, 11);
});

test('tenant boundaries are enforced on graph edges', () => {
  const graph = new AcquisitionGraph();
  graph.upsertNode({id:'a', tenantId:'tenant-a', type:'account', label:'A', attributes:{}, evidenceIds:[]});
  graph.upsertNode({id:'b', tenantId:'tenant-b', type:'contact', label:'B', attributes:{}, evidenceIds:[]});

  assert.throws(
    () => graph.addEdge({id:'e', tenantId:'tenant-a', fromId:'a', toId:'b', type:'contacts', evidenceIds:[]}),
    /TENANT_SCOPE_DENIED/,
  );
});
