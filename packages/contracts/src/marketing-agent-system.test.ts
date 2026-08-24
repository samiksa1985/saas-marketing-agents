import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_MARKETING_OS_DOMAIN_AGENTS,
  AI_MARKETING_OS_DOMAIN_CAPABILITIES,
  getDomainAgent,
  getDomainCapabilities,
} from './marketing-agent-system.js';

test('merged domain-agent catalog preserves project-2 workforce', () => {
  assert.equal(AI_MARKETING_OS_DOMAIN_AGENTS.length, 14);
  assert.equal(AI_MARKETING_OS_DOMAIN_CAPABILITIES.length, 28);
  for (const agent of AI_MARKETING_OS_DOMAIN_AGENTS) {
    assert.ok(agent.id);
    assert.equal(getDomainAgent(agent.id).id, agent.id);
    assert.ok(getDomainCapabilities(agent.id).length >= 1);
  }
});

test('capability ownership is unique', () => {
  const ids = new Set<string>();
  for (const capability of AI_MARKETING_OS_DOMAIN_CAPABILITIES) {
    assert.equal(ids.has(capability.id), false);
    ids.add(capability.id);
  }
});
