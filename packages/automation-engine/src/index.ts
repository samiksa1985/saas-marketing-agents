import type {
  AutomationCondition,
  AutomationDefinition,
  AutomationDispatchResult as CanonicalAutomationDispatchResult,
  AutomationExecutionRequest,
  AutomationSignal,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationWorkflowStartResult,
  TenantContext,
} from '@platform/contracts';

export type {
  AutomationCondition,
  AutomationConditionMode,
  AutomationConditionOperator,
  AutomationDefinition,
  AutomationExecutionRecord,
  AutomationExecutionRequest,
  AutomationExecutionStatus,
  AutomationSignal,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationWorkflowStartResult,
} from '@platform/contracts';

export interface AutomationWorkflowStarter {
  start(
    request: AutomationExecutionRequest,
    context: TenantContext,
  ): Promise<AutomationWorkflowStartResult>;
}

export interface AutomationDispatchResult
  extends CanonicalAutomationDispatchResult {}

export class AutomationEngineError extends Error {}

function requireTenant(
  tenantId: string,
): void {
  if (!tenantId) {
    throw new AutomationEngineError(
      'Tenant context is required',
    );
  }
}

function assertTenant(
  expected: string,
  actual: string,
): void {
  requireTenant(actual);

  if (expected !== actual) {
    throw new AutomationEngineError(
      'Cross-tenant automation access denied',
    );
  }
}

function valueAtPath(
  payload: Record<string, unknown>,
  field: string,
): unknown {
  const segments =
    field.split('.');

  let value: unknown =
    payload;

  for (const segment of segments) {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return undefined;
    }

    value =
      (
        value as Record<
          string,
          unknown
        >
      )[segment];
  }

  return value;
}

function compare(
  left: unknown,
  condition: AutomationCondition,
): boolean {
  const right =
    condition.value;

  switch (condition.operator) {
    case 'EXISTS':
      return (
        left !== undefined &&
        left !== null
      );

    case 'EQ':
      return left === right;

    case 'NEQ':
      return left !== right;

    case 'GT':
      return (
        typeof left === 'number' &&
        typeof right === 'number' &&
        left > right
      );

    case 'GTE':
      return (
        typeof left === 'number' &&
        typeof right === 'number' &&
        left >= right
      );

    case 'LT':
      return (
        typeof left === 'number' &&
        typeof right === 'number' &&
        left < right
      );

    case 'LTE':
      return (
        typeof left === 'number' &&
        typeof right === 'number' &&
        left <= right
      );

    case 'CONTAINS':
      if (
        typeof left === 'string' &&
        typeof right === 'string'
      ) {
        return left.includes(
          right,
        );
      }

      if (Array.isArray(left)) {
        return left.includes(
          right,
        );
      }

      return false;
  }
}

export function evaluateAutomationConditions(
  definition: AutomationDefinition,
  payload: Record<string, unknown>,
): boolean {
  if (
    definition.conditions.length === 0
  ) {
    return true;
  }

  const evaluations =
    definition.conditions.map(
      (condition) =>
        compare(
          valueAtPath(
            payload,
            condition.field,
          ),
          condition,
        ),
    );

  if (
    definition.conditionMode === 'ANY'
  ) {
    return evaluations.some(
      Boolean,
    );
  }

  return evaluations.every(
    Boolean,
  );
}

export function automationTriggerMatches(
  trigger: AutomationTrigger,
  signal: AutomationSignal,
): boolean {
  if (
    trigger.type !==
    signal.triggerType
  ) {
    return false;
  }

  switch (trigger.type) {
    case 'MANUAL':
      return true;

    case 'EVENT':
      return (
        signal.eventType ===
        trigger.eventType
      );

    case 'WEBHOOK':
      return (
        signal.webhookKey ===
        trigger.webhookKey
      );

    case 'SCHEDULE':
      return (
        signal.scheduleExpression ===
        trigger.scheduleExpression
      );
  }
}

export class AutomationDispatcher {
  private readonly processed =
    new Set<string>();

  constructor(
    private readonly workflowStarter:
      AutomationWorkflowStarter,
  ) {}

  async dispatch(
    definition: AutomationDefinition,
    signal: AutomationSignal,
    context: TenantContext,
  ): Promise<AutomationDispatchResult> {
    assertTenant(
      definition.tenantId,
      context.tenantId,
    );

    assertTenant(
      definition.tenantId,
      signal.tenantId,
    );

    const dedupeKey =
      [
        definition.tenantId,
        definition.id,
        signal.idempotencyKey,
      ].join(':');

    if (
      this.processed.has(
        dedupeKey,
      )
    ) {
      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'DUPLICATE',
        reason:
          'Signal already processed',
      };
    }

    if (!definition.enabled) {
      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'SKIPPED_DISABLED',
      };
    }

    if (
      !automationTriggerMatches(
        definition.trigger,
        signal,
      )
    ) {
      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'SKIPPED_TRIGGER_MISMATCH',
      };
    }

    if (
      !evaluateAutomationConditions(
        definition,
        signal.payload,
      )
    ) {
      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'SKIPPED_CONDITIONS',
      };
    }

    this.processed.add(
      dedupeKey,
    );

    try {
      const started =
        await this.workflowStarter.start(
          {
            tenantId:
              definition.tenantId,
            automationId:
              definition.id,
            workflowReference:
              definition.workflowReference,
            idempotencyKey:
              signal.idempotencyKey,
            locale:
              definition.locale,
            triggerType:
              signal.triggerType,
            occurredAt:
              signal.occurredAt,
            payload:
              signal.payload,
          },
          context,
        );

      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'STARTED',
        workflowId:
          started.workflowId,
      };
    } catch (error) {
      this.processed.delete(
        dedupeKey,
      );

      throw error;
    }
  }
}


/*
 * Production dispatcher uses a durable execution
 * coordinator rather than the in-memory processed Set.
 */
export interface AutomationExecutionCoordinator {
  claim(
    request: AutomationExecutionRequest,
  ): Promise<
    | {
        claimed: true;
        executionId: string;
      }
    | {
        claimed: false;
        duplicate: true;
        workflowId?: string;
      }
  >;

  markStarted(
    executionId: string,
    workflowId: string,
  ): Promise<void>;

  markFailed(
    executionId: string,
    error: string,
  ): Promise<void>;
}

export class DurableAutomationDispatcher {
  constructor(
    private readonly workflowStarter:
      AutomationWorkflowStarter,

    private readonly executions:
      AutomationExecutionCoordinator,
  ) {}

  async dispatch(
    definition: AutomationDefinition,
    signal: AutomationSignal,
    context: TenantContext,
  ): Promise<AutomationDispatchResult> {
    assertTenant(
      definition.tenantId,
      context.tenantId,
    );

    assertTenant(
      definition.tenantId,
      signal.tenantId,
    );

    if (!definition.enabled) {
      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'SKIPPED_DISABLED',
      };
    }

    if (
      !automationTriggerMatches(
        definition.trigger,
        signal,
      )
    ) {
      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'SKIPPED_TRIGGER_MISMATCH',
      };
    }

    if (
      !evaluateAutomationConditions(
        definition,
        signal.payload,
      )
    ) {
      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'SKIPPED_CONDITIONS',
      };
    }

    const request:
      AutomationExecutionRequest = {
        tenantId:
          definition.tenantId,
        automationId:
          definition.id,
        workflowReference:
          definition.workflowReference,
        idempotencyKey:
          signal.idempotencyKey,
        locale:
          definition.locale,
        triggerType:
          signal.triggerType,
        occurredAt:
          signal.occurredAt,
        payload:
          signal.payload,
      };

    const claim =
      await this.executions.claim(
        request,
      );

    if (claim.claimed === false) {
      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'DUPLICATE',
        ...(claim.workflowId
          ? {
              workflowId:
                claim.workflowId,
            }
          : {}),
      };
    }

    try {
      const started =
        await this.workflowStarter.start(
          request,
          context,
        );

      await this.executions.markStarted(
        claim.executionId,
        started.workflowId,
      );

      return {
        automationId:
          definition.id,
        tenantId:
          definition.tenantId,
        status:
          'STARTED',
        workflowId:
          started.workflowId,
      };
    } catch (error) {
      await this.executions.markFailed(
        claim.executionId,
        error instanceof Error
          ? error.message
          : 'Automation workflow start failed',
      );

      throw error;
    }
  }
}


/*
 * Generic canonical workflow adapter.
 *
 * The resolver translates workflowReference into the
 * existing canonical workflow input. Therefore this does
 * not create another workflow model.
 */
export interface CanonicalWorkflowPort {
  createWorkflow(
    input: unknown,
  ): Promise<{
    id: string;
  }>;

  start(
    workflowId: string,
    context: TenantContext,
    metadata: {
      actor: string;
      reason: string;
      timestamp: string;
      idempotencyKey: string;
    },
  ): Promise<unknown>;
}

export interface WorkflowReferenceResolver {
  resolve(
    request: AutomationExecutionRequest,
  ): Promise<unknown>;
}

export class CanonicalAutomationWorkflowStarter
  implements AutomationWorkflowStarter {
  constructor(
    private readonly runtime:
      CanonicalWorkflowPort,

    private readonly resolver:
      WorkflowReferenceResolver,
  ) {}

  async start(
    request: AutomationExecutionRequest,
    context: TenantContext,
  ): Promise<AutomationWorkflowStartResult> {
    assertTenant(
      request.tenantId,
      context.tenantId,
    );

    const workflowInput =
      await this.resolver.resolve(
        request,
      );

    const workflow =
      await this.runtime.createWorkflow(
        workflowInput,
      );

    await this.runtime.start(
      workflow.id,
      context,
      {
        actor:
          'automation-engine',

        reason:
          `Automation ${request.automationId} triggered workflow`,

        timestamp:
          request.occurredAt,

        idempotencyKey:
          `automation:${request.automationId}:${request.idempotencyKey}`,
      },
    );

    return {
      workflowId:
        workflow.id,
    };
  }
}
