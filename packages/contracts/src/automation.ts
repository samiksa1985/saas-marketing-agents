import type {
  Locale,
} from './index.js';

export type AutomationTriggerType =
  | 'MANUAL'
  | 'EVENT'
  | 'SCHEDULE'
  | 'WEBHOOK';

export type AutomationConditionOperator =
  | 'EQ'
  | 'NEQ'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'CONTAINS'
  | 'EXISTS';

export type AutomationConditionMode =
  | 'ALL'
  | 'ANY';

export interface AutomationCondition {
  field: string;
  operator: AutomationConditionOperator;
  value?: unknown;
}

export interface ManualAutomationTrigger {
  type: 'MANUAL';
}

export interface EventAutomationTrigger {
  type: 'EVENT';
  eventType: string;
}

export interface ScheduleAutomationTrigger {
  type: 'SCHEDULE';
  scheduleExpression: string;
  timezone?: string;
}

export interface WebhookAutomationTrigger {
  type: 'WEBHOOK';
  webhookKey: string;
}

export type AutomationTrigger =
  | ManualAutomationTrigger
  | EventAutomationTrigger
  | ScheduleAutomationTrigger
  | WebhookAutomationTrigger;

export interface AutomationDefinition {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditionMode: AutomationConditionMode;
  conditions: AutomationCondition[];
  workflowReference: string;
  locale: Locale;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationSignal {
  tenantId: string;
  triggerType: AutomationTriggerType;
  idempotencyKey: string;
  occurredAt: string;
  eventType?: string;
  webhookKey?: string;
  scheduleExpression?: string;
  payload: Record<string, unknown>;
}

export type AutomationExecutionStatus =
  | 'PENDING'
  | 'STARTED'
  | 'FAILED';

export interface AutomationExecutionRecord {
  id: string;
  tenantId: string;
  automationId: string;
  idempotencyKey: string;
  triggerType: AutomationTriggerType;
  status: AutomationExecutionStatus;
  workflowId?: string;
  attempts: number;
  occurredAt: string;
  lastAttemptAt: string;
  leaseExpiresAt?: string;
  error?: string;
}

export interface AutomationExecutionRequest {
  tenantId: string;
  automationId: string;
  workflowReference: string;
  idempotencyKey: string;
  locale: Locale;
  triggerType: AutomationTriggerType;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface AutomationWorkflowStartResult {
  workflowId: string;
}

export interface AutomationDispatchResult {
  automationId: string;
  tenantId: string;

  status:
    | 'STARTED'
    | 'SKIPPED_DISABLED'
    | 'SKIPPED_TRIGGER_MISMATCH'
    | 'SKIPPED_CONDITIONS'
    | 'DUPLICATE';

  workflowId?: string;
  reason?: string;
}
