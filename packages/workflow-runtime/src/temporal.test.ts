import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenantContext } from '@platform/contracts';
import {
  LocalWorkflowExecutor,
  type CreateWorkflowInput,
  type TransitionMetadata,
  type Workflow,
} from './index.js';
import { TemporalWorkflowRuntime } from './temporal.js';

const context: TenantContext = {
  tenantId: 'tenant-a',
  roles: [],
  permissions: ['workflow:execute'],
  locale: 'en',
};
const metadata: TransitionMetadata = {
  actor: 'test',
  reason: 'adapter test',
  timestamp: '2026-01-01T00:00:00.000Z',
  idempotencyKey: 'adapter-1',
};
const input: CreateWorkflowInput = {
  tenantId: 'tenant-a',
  engagementId: 'engagement-a',
  locale: 'en',
  selectedWorkstreamIds: ['01'],
  idempotencyKey: 'create-1',
};

test('Temporal and Local execution adapters share WorkflowRuntime contract', async () => {
  const calls: string[] = [];
  const workflow = {} as Workflow;
  const temporal = new TemporalWorkflowRuntime({
    startWorkflow: async () => {
      calls.push('create');
      return workflow;
    },
    signalWorkflow: async (_id, signal) => {
      calls.push(signal);
      return workflow;
    },
  });
  const local = new LocalWorkflowExecutor({
    createWorkflow: async () => workflow,
    start: async () => workflow,
    pause: async () => workflow,
    resume: async () => workflow,
    cancel: async () => workflow,
  } as never);
  assert.equal(typeof local.createWorkflow, 'function');
  assert.equal(await temporal.createWorkflow(input), workflow);
  await temporal.start('workflow-a', context, metadata);
  await temporal.pause('workflow-a', context, metadata);
  assert.deepEqual(calls, ['create', 'start', 'pause']);
});
