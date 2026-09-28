import * as assert from 'node:assert/strict';
import test from 'node:test';
import type { TenantContext } from '@platform/contracts';

import type {
  CreateWorkflowInput,
  TransitionMetadata,
  Workflow,
} from './index.js';
import { InMemoryWorkflowRuntime } from './index.js';
import { createWorkflowRuntime } from './provider.js';
import type { TemporalWorkflowReadModel } from './query.js';
import { TemporalWorkflowRuntime } from './temporal.js';

const context: TenantContext = {
  tenantId: 'tenant-a',
  roles: [],
  permissions: [],
  locale: 'en',
};

function readModel(overrides: Partial<TemporalWorkflowReadModel> = {}): TemporalWorkflowReadModel {
  return {
    getWorkflow: async () => ({} as Workflow),
    getTasks: async () => [],
    getArtifacts: async () => [],
    getHandoffs: async () => [],
    getAudits: async () => [],
    getTaskReadiness: async () => ({ ready: false, issues: [] }),
    ...overrides,
  };
}

test('workflow provider selects the in-memory runtime only when explicitly requested', () => {
  const selection = createWorkflowRuntime({
    mode: 'in-memory',
    repositoryRoot: process.cwd(),
  });

  assert.equal(selection.mode, 'in-memory');
  assert.equal(selection.durable, false);
  assert.ok(selection.runtime instanceof InMemoryWorkflowRuntime);
});

test('workflow provider selects the durable Temporal adapter', () => {
  const adapter = {
    async startWorkflow(_input: CreateWorkflowInput): Promise<Workflow> {
      return {} as Workflow;
    },
    async signalWorkflow(
      _workflowId: string,
      _signal: 'start' | 'pause' | 'resume' | 'cancel',
      _context: Parameters<TemporalWorkflowRuntime['start']>[1],
      _metadata: TransitionMetadata,
    ): Promise<Workflow> {
      return {} as Workflow;
    },
  };
  const selection = createWorkflowRuntime({
    mode: 'temporal',
    temporalAdapter: adapter,
    temporalReadModel: readModel(),
  });

  assert.equal(selection.mode, 'temporal');
  assert.equal(selection.durable, true);
  assert.ok(selection.runtime instanceof TemporalWorkflowRuntime);
});

test('workflow provider refuses temporal mode without a durable adapter', () => {
  assert.throws(
    () => createWorkflowRuntime({ mode: 'temporal' }),
    /Temporal workflow adapter/i,
  );
});

test('workflow provider refuses temporal mode without a durable read model', () => {
  const adapter = {
    async startWorkflow(_input: CreateWorkflowInput): Promise<Workflow> {
      return {} as Workflow;
    },
    async signalWorkflow(): Promise<Workflow> {
      return {} as Workflow;
    },
  };

  assert.throws(
    () => createWorkflowRuntime({ mode: 'temporal', temporalAdapter: adapter }),
    /Temporal workflow read model/i,
  );
});

test('temporal workflow query delegates reads to the injected durable read model', async () => {
  const calls: string[] = [];
  const adapter = {
    async startWorkflow(_input: CreateWorkflowInput): Promise<Workflow> {
      return {} as Workflow;
    },
    async signalWorkflow(): Promise<Workflow> {
      return {} as Workflow;
    },
  };
  const workflow = { id: 'workflow-a', tenantId: 'tenant-a' } as Workflow;
  const selection = createWorkflowRuntime({
    mode: 'temporal',
    temporalAdapter: adapter,
    temporalReadModel: readModel({
      getWorkflow: async (workflowId, requestContext) => {
        calls.push(`${workflowId}:${requestContext.tenantId}`);
        return workflow;
      },
    }),
  });

  assert.equal(
    await selection.query.getWorkflow('workflow-a', context),
    workflow,
  );
  assert.deepEqual(calls, ['workflow-a:tenant-a']);
});
