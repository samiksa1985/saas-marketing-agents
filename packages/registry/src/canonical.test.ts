import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_MARKETING_OS_DOMAIN_AGENTS,
  getDomainAgent,
} from '@platform/contracts';
import { loadCanonicalAgentRegistry, summarizeCanonicalRegistry } from './canonical.js';

test('canonical registry exposes project-2 domain leaders without replacing project-1 specialists', async () => {
  const snapshot = await loadCanonicalAgentRegistry({
    registryLoader: {
      loadAgents: async () => ({
        all: () => [
          {
            agentId: 'test-specialist',
            name: 'Test Specialist',
            specialty: 'test',
            category: 'content',
            sourcePath: 'content/test.md',
            sourceRevision: 'rev',
            inputContractSummary: 'input',
            outputContractSummary: 'output',
            approvalRequirements: [],
            active: true,
            version: 'rev',
          },
        ],
      }),
    } as never,
  });

  assert.equal(snapshot.domainLeaders.length, AI_MARKETING_OS_DOMAIN_AGENTS.length);
  assert.equal(snapshot.specialists.length, 1);
  assert.equal(getDomainAgent('marketing-strategist').id, 'marketing-strategist');

  const summary = summarizeCanonicalRegistry(snapshot);
  assert.equal(summary.domainLeaders, 14);
  assert.equal(summary.specialists, 1);
  assert.equal(summary.totalAddressableAgents, 15);
});

test('control roles are not silently treated as business specialists', async () => {
  const snapshot = await loadCanonicalAgentRegistry({
    registryLoader: {
      loadAgents: async () => ({
        all: () => [],
      }),
    } as never,
  });

  const orchestrator = snapshot.domainLeaders.find((item) => item.id === 'ai-orchestrator');
  const automation = snapshot.domainLeaders.find((item) => item.id === 'automation');
  assert.equal(orchestrator?.tier, 'CONTROL');
  assert.equal(automation?.tier, 'CONTROL');
});
