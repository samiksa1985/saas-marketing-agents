import type { TenantContext } from '@platform/contracts';
import type {
  Handoff,
  ProposedArtifact,
  ReadinessResult,
  Task,
  Workflow,
  WorkflowAuditEvent,
} from './index.js';
import { TenantIsolationError } from './index.js';
import { PostgresWorkflowRuntime } from './postgres.js';
import type { WorkflowRuntimeQuery } from './query.js';

function requireTenant(context: TenantContext | undefined): TenantContext {
  if (!context?.tenantId) throw new TenantIsolationError('Tenant context is required');
  return context;
}

/** Durable PostgreSQL read model used by production API queries. */
export class PostgresWorkflowQuery implements WorkflowRuntimeQuery {
  constructor(private readonly runtime: PostgresWorkflowRuntime) {}

  async getWorkflow(workflowId: string, context: TenantContext): Promise<Workflow> {
    return this.runtime.toLegacyWorkflow(await this.runtime.getExecution(workflowId, context));
  }

  async getTasks(workflowId: string, context: TenantContext): Promise<Task[]> {
    const execution = await this.runtime.getExecution(workflowId, context);
    return [this.runtime.toLegacyTask(execution)];
  }

  async getArtifacts(_workflowId: string, context: TenantContext): Promise<ProposedArtifact[]> {
    requireTenant(context);
    return [];
  }

  async getHandoffs(_workflowId: string, context: TenantContext): Promise<Handoff[]> {
    requireTenant(context);
    return [];
  }

  async getAudits(context: TenantContext): Promise<WorkflowAuditEvent[]> {
    requireTenant(context);
    return [];
  }

  async getTaskReadiness(taskId: string, context: TenantContext): Promise<ReadinessResult> {
    const execution = await this.runtime.getExecution(taskId, context);
    return {
      ready: ['pending', 'retry_scheduled'].includes(execution.status),
      issues: execution.status === 'waiting_approval' ? ['Required approval is missing'] : [],
    };
  }
}
