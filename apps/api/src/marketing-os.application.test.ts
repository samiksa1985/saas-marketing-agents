import test from 'node:test';
import assert from 'node:assert/strict';
import type { TenantContext } from '@platform/contracts';
import {
  InMemoryMarketingOSExecutionRecordRepository,
  InMemoryMarketingOSPlanRepository,
  MarketingOSExecutionService,
} from '@platform/marketing-os-core';
import type { WorkflowRuntime, WorkflowRuntimeQuery } from '@platform/workflow-runtime';
import { MarketingOsApplicationService } from './marketing-os.application.js';

const context: TenantContext = {
  tenantId: 'tenant-a',
  roles: [],
  permissions: [],
  locale: 'en',
};

test('Marketing OS run reads use WorkflowRuntimeQuery rather than a concrete runtime', async () => {
  const calls: string[] = [];
  const query: WorkflowRuntimeQuery = {
    async getWorkflow(workflowId) {
      calls.push(`workflow:${workflowId}`);
      return { id: workflowId, tenantId: 'tenant-a', status: 'running' } as never;
    },
    async getTasks(workflowId) {
      calls.push(`tasks:${workflowId}`);
      return [];
    },
    async getArtifacts(workflowId) {
      calls.push(`artifacts:${workflowId}`);
      return [];
    },
    async getHandoffs() {
      return [];
    },
    async getAudits() {
      calls.push('audits');
      return [];
    },
    async getTaskReadiness() {
      return { ready: false, issues: [] };
    },
  };
  const records = new InMemoryMarketingOSExecutionRecordRepository();
  await records.save(context, {
    tenantId: 'tenant-a',
    planId: 'plan-query',
    engagementId: 'engagement-query',
    locale: 'en',
    idempotencyKey: 'query-v1',
    workflowId: 'workflow-query',
    status: 'RUNNING',
    approved: true,
    reasons: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const executions = new MarketingOSExecutionService({
    runtime: {} as WorkflowRuntime,
    query,
    records,
  });
  const app = new MarketingOsApplicationService(
    { plan: async () => { throw new Error('not used'); } },
    new InMemoryMarketingOSPlanRepository(),
    executions,
    query,
    { get: () => { throw new Error('not used'); } } as never,
  );

  const result = await app.run(context, 'plan-query');
  assert.equal(result.workflow?.id, 'workflow-query');
  assert.deepEqual(calls.sort(), [
    'artifacts:workflow-query',
    'audits',
    'tasks:workflow-query',
    'workflow:workflow-query',
  ]);
});
