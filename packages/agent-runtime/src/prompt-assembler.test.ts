import test from 'node:test';
import assert from 'node:assert/strict';

import { assembleAgentPrompt } from './prompt-assembler.js';

import type { ParsedAgentDefinition } from './definition-loader.js';

const definition: ParsedAgentDefinition = {
  agentId: 'abm-account-based-strategist',
  name: 'Account-Based Marketing Strategist',
  description: 'Builds account-specific ABM strategy.',
  identity: 'You are a senior account-based marketing strategist.',
  mission: [
    'Define the target account strategy.',
    'Identify account-level buying signals.',
  ],
  criticalRules: [
    'Do not invent customer facts.',
    'Escalate missing information.',
  ],
  deliverables: [
    'Account strategy',
    'Prioritized account plan',
  ],
  successMetrics: [
    'Clear account prioritization',
    'Evidence-backed recommendations',
  ],
  needsInput: [
    '[NEEDS INPUT: company name]',
    '[NEEDS INPUT: account proof]',
  ],
  sourcePath: 'abm/abm-account-based-strategist.md',
  sourceRevision:
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  version: 'sha256:aaaaaaaaaaaaaaaa',
};

const context = {
  locale: 'en-US' as const,
  tenantContext: {
    tenantId: 'tenant-001',
  },
  workflowId: 'workflow-001',
  taskId: 'task-001',
  workstreamId: '01',
  agentId: 'abm-account-based-strategist',
  approvedSystemInstructions:
    'Use only approved account evidence.',
  input: {
    company: 'Example Corp',
    objective: 'Build an ABM account strategy.',
  },
  inputArtifactReferences: [
    {
      artifactId: 'artifact-001',
      kind: 'account-research',
    },
  ],
};

test(
  'prompt assembler includes the complete agent definition',
  () => {
    const result = assembleAgentPrompt(
      definition,
      context,
    );

    assert.match(
      result.systemPrompt,
      /AGENT ID: abm-account-based-strategist/,
    );

    assert.match(
      result.systemPrompt,
      /Account-Based Marketing Strategist/,
    );

    assert.match(
      result.systemPrompt,
      /MISSION:/,
    );

    assert.match(
      result.systemPrompt,
      /Define the target account strategy\./,
    );

    assert.match(
      result.systemPrompt,
      /CRITICAL RULES:/,
    );

    assert.match(
      result.systemPrompt,
      /Do not invent customer facts\./,
    );

    assert.match(
      result.systemPrompt,
      /DELIVERABLES:/,
    );

    assert.match(
      result.systemPrompt,
      /SUCCESS METRICS:/,
    );

    assert.match(
      result.systemPrompt,
      /\[NEEDS INPUT: company name\]/,
    );
  },
);

test(
  'prompt assembler preserves workflow and tenant execution context',
  () => {
    const result = assembleAgentPrompt(
      definition,
      context,
    );

    assert.match(
      result.systemPrompt,
      /LOCALE: en-US/,
    );

    assert.match(
      result.systemPrompt,
      /TENANT ID: tenant-001/,
    );

    assert.match(
      result.systemPrompt,
      /WORKFLOW ID: workflow-001/,
    );

    assert.match(
      result.systemPrompt,
      /TASK ID: task-001/,
    );

    assert.match(
      result.systemPrompt,
      /WORKSTREAM ID: 01/,
    );

    assert.match(
      result.systemPrompt,
      /EXECUTION AGENT ID: abm-account-based-strategist/,
    );

    assert.match(
      result.systemPrompt,
      /Use only approved account evidence\./,
    );
  },
);

test(
  'prompt assembler produces deterministic prompts for identical inputs',
  () => {
    const first = assembleAgentPrompt(
      definition,
      context,
    );

    const second = assembleAgentPrompt(
      definition,
      context,
    );

    assert.deepEqual(second, first);

    assert.match(
      first.userPrompt,
      /Example Corp/,
    );

    assert.match(
      first.userPrompt,
      /artifact-001 \(account-research\)/,
    );

    assert.match(
      first.userPrompt,
      /Do not self-approve the result\./,
    );

    assert.match(
      first.userPrompt,
      /\[NEEDS INPUT\]/,
    );
  },
);
