import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import type { TenantContext } from '@platform/contracts';
import { externalActionPolicies, externalActionPolicyAudit } from '@platform/db';
import type { ExternalActionPolicy } from '@platform/marketing-os-core';

import type { MarketingOSPersistenceDatabase } from './index.js';

export type DurableExternalActionExecutionMode = 'DISABLED' | 'DRY_RUN' | 'REAL';
export type DurableExternalActionApprovalMode = 'NONE' | 'HUMAN';

/** Stored source-of-truth policy. No provider credential is accepted or returned. */
export interface DurableExternalActionPolicy {
  id: string;
  tenantId: string;
  organizationId: string;
  provider: string;
  enabled: boolean;
  executionMode: DurableExternalActionExecutionMode;
  allowedActionTypes: string[];
  allowedAccounts: string[];
  deniedAccounts: string[];
  allowedCampaigns: string[];
  deniedCampaigns: string[];
  maxAbsoluteBudgetDelta: number;
  maxPercentageBudgetDelta: number;
  monthlySpendCeiling: number;
  minimumConfidence: number;
  requiredEvidence: boolean;
  approvalMode: DurableExternalActionApprovalMode;
  requiredApprovalRole?: string;
  killSwitch: boolean;
  dryRunOnly: boolean;
  executionHours?: { start: number; end: number };
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export type ExternalActionPolicyUpdate = Omit<
  DurableExternalActionPolicy,
  'id' | 'tenantId' | 'provider' | 'version' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>;

function assertContext(context: TenantContext): void {
  if (!context.tenantId) throw new Error('TENANT_SCOPE_DENIED');
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...value] : [];
}

function policyFromRow(row: typeof externalActionPolicies.$inferSelect): DurableExternalActionPolicy {
  const executionHours = row.executionHours as { start?: unknown; end?: unknown } | null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    provider: row.provider,
    enabled: row.enabled,
    executionMode: row.executionMode as DurableExternalActionExecutionMode,
    allowedActionTypes: stringArray(row.allowedActionTypes),
    allowedAccounts: stringArray(row.allowedAccounts),
    deniedAccounts: stringArray(row.deniedAccounts),
    allowedCampaigns: stringArray(row.allowedCampaigns),
    deniedCampaigns: stringArray(row.deniedCampaigns),
    maxAbsoluteBudgetDelta: row.maxAbsoluteBudgetDelta,
    maxPercentageBudgetDelta: row.maxPercentageBudgetDelta,
    monthlySpendCeiling: row.monthlySpendCeiling,
    minimumConfidence: row.minimumConfidence,
    requiredEvidence: row.requiredEvidence,
    approvalMode: row.approvalMode as DurableExternalActionApprovalMode,
    ...(row.requiredApprovalRole ? { requiredApprovalRole: row.requiredApprovalRole } : {}),
    killSwitch: row.killSwitch,
    dryRunOnly: row.dryRunOnly,
    ...(typeof executionHours?.start === 'number' && typeof executionHours.end === 'number'
      ? { executionHours: { start: executionHours.start, end: executionHours.end } }
      : {}),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/** Converts the durable record into the already-canonical policy evaluator input. */
export function toEvaluatedExternalActionPolicy(
  policy: DurableExternalActionPolicy | undefined,
): ExternalActionPolicy | undefined {
  if (!policy) return undefined;
  return {
    policyId: policy.id,
    policyVersion: policy.version,
    tenantId: policy.tenantId,
    // Disabled and REAL-mode-not-enabled records deny through the same policy
    // engine rather than permitting a gateway invocation.
    providerAllowlist:
      policy.enabled && policy.executionMode !== 'DISABLED' ? [policy.provider] : [],
    actionTypeAllowlist: policy.allowedActionTypes,
    accountAllowlist: policy.allowedAccounts,
    accountDenylist: policy.deniedAccounts,
    campaignAllowlist: policy.allowedCampaigns,
    campaignDenylist: policy.deniedCampaigns,
    maxAbsoluteBudgetDelta: policy.maxAbsoluteBudgetDelta,
    maxPercentageBudgetDelta: policy.maxPercentageBudgetDelta,
    minimumConfidence: policy.minimumConfidence,
    requiredEvidence: policy.requiredEvidence,
    requiredApprovalLevel: policy.approvalMode,
    ...(policy.requiredApprovalRole ? { requiredApprovalRole: policy.requiredApprovalRole } : {}),
    ...(policy.executionHours ? { allowedExecutionHoursUtc: policy.executionHours } : {}),
    killSwitch: policy.killSwitch || !policy.enabled || policy.executionMode === 'DISABLED',
    dryRunOnly: policy.dryRunOnly || policy.executionMode === 'DRY_RUN',
  };
}

/** Tenant-scoped policy administration source with append-only revision audit. */
export class PersistentExternalActionPolicyStore {
  constructor(private readonly db: MarketingOSPersistenceDatabase) {}

  async get(context: TenantContext, provider: string): Promise<DurableExternalActionPolicy | undefined> {
    assertContext(context);
    const [row] = await this.db
      .select()
      .from(externalActionPolicies)
      .where(and(eq(externalActionPolicies.tenantId, context.tenantId), eq(externalActionPolicies.provider, provider)))
      .limit(1);
    return row ? policyFromRow(row) : undefined;
  }

  async list(context: TenantContext): Promise<DurableExternalActionPolicy[]> {
    assertContext(context);
    const rows = await this.db
      .select()
      .from(externalActionPolicies)
      .where(eq(externalActionPolicies.tenantId, context.tenantId));
    return rows.map(policyFromRow);
  }

  async upsert(
    context: TenantContext,
    provider: string,
    update: ExternalActionPolicyUpdate,
  ): Promise<DurableExternalActionPolicy> {
    assertContext(context);
    validatePolicyUpdate(update);
    const now = new Date();
    const actor = context.userId ?? 'system';
    const [row] = await this.db
      .insert(externalActionPolicies)
      .values({
        id: randomUUID(),
        tenantId: context.tenantId,
        organizationId: update.organizationId,
        provider,
        enabled: update.enabled,
        executionMode: update.executionMode,
        allowedActionTypes: update.allowedActionTypes,
        allowedAccounts: update.allowedAccounts,
        deniedAccounts: update.deniedAccounts,
        allowedCampaigns: update.allowedCampaigns,
        deniedCampaigns: update.deniedCampaigns,
        maxAbsoluteBudgetDelta: update.maxAbsoluteBudgetDelta,
        maxPercentageBudgetDelta: update.maxPercentageBudgetDelta,
        monthlySpendCeiling: update.monthlySpendCeiling,
        minimumConfidence: update.minimumConfidence,
        requiredEvidence: update.requiredEvidence,
        approvalMode: update.approvalMode,
        requiredApprovalRole: update.requiredApprovalRole ?? null,
        killSwitch: update.killSwitch,
        dryRunOnly: update.dryRunOnly,
        executionHours: update.executionHours ?? null,
        version: 1,
        createdBy: actor,
        updatedBy: actor,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [externalActionPolicies.tenantId, externalActionPolicies.provider],
        set: {
          organizationId: update.organizationId,
          enabled: update.enabled,
          executionMode: update.executionMode,
          allowedActionTypes: update.allowedActionTypes,
          allowedAccounts: update.allowedAccounts,
          deniedAccounts: update.deniedAccounts,
          allowedCampaigns: update.allowedCampaigns,
          deniedCampaigns: update.deniedCampaigns,
          maxAbsoluteBudgetDelta: update.maxAbsoluteBudgetDelta,
          maxPercentageBudgetDelta: update.maxPercentageBudgetDelta,
          monthlySpendCeiling: update.monthlySpendCeiling,
          minimumConfidence: update.minimumConfidence,
          requiredEvidence: update.requiredEvidence,
          approvalMode: update.approvalMode,
          requiredApprovalRole: update.requiredApprovalRole ?? null,
          killSwitch: update.killSwitch,
          dryRunOnly: update.dryRunOnly,
          executionHours: update.executionHours ?? null,
          version: sql`${externalActionPolicies.version} + 1`,
          updatedBy: actor,
          updatedAt: now,
        },
      })
      .returning();
    if (!row) throw new Error('EXTERNAL_ACTION_POLICY_UPSERT_FAILED');
    const policy = policyFromRow(row);
    await this.db.insert(externalActionPolicyAudit).values({
      id: randomUUID(),
      tenantId: context.tenantId,
      policyId: policy.id,
      version: policy.version,
      actor,
      eventType: policy.version === 1 ? 'EXTERNAL_ACTION_POLICY_CREATED' : 'EXTERNAL_ACTION_POLICY_UPDATED',
      snapshot: policySnapshot(policy),
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return policy;
  }
}

function validatePolicyUpdate(policy: ExternalActionPolicyUpdate): void {
  if (!policy.organizationId?.trim() || !Array.isArray(policy.allowedActionTypes) || !policy.allowedActionTypes.length) {
    throw new Error('EXTERNAL_ACTION_POLICY_REQUIRED_FIELDS_INVALID');
  }
  if (
    !Number.isFinite(policy.maxAbsoluteBudgetDelta) || policy.maxAbsoluteBudgetDelta < 0 ||
    !Number.isFinite(policy.maxPercentageBudgetDelta) || policy.maxPercentageBudgetDelta < 0 ||
    !Number.isFinite(policy.monthlySpendCeiling) || policy.monthlySpendCeiling < 0 ||
    !Number.isFinite(policy.minimumConfidence) || policy.minimumConfidence < 0 || policy.minimumConfidence > 1
  ) {
    throw new Error('EXTERNAL_ACTION_POLICY_NUMERIC_LIMIT_INVALID');
  }
  if (policy.executionHours && (!Number.isInteger(policy.executionHours.start) || !Number.isInteger(policy.executionHours.end))) {
    throw new Error('EXTERNAL_ACTION_POLICY_EXECUTION_HOURS_INVALID');
  }
}

function policySnapshot(policy: DurableExternalActionPolicy): Record<string, unknown> {
  return {
    organizationId: policy.organizationId,
    provider: policy.provider,
    enabled: policy.enabled,
    executionMode: policy.executionMode,
    allowedActionTypes: policy.allowedActionTypes,
    allowedAccounts: policy.allowedAccounts,
    deniedAccounts: policy.deniedAccounts,
    allowedCampaigns: policy.allowedCampaigns,
    deniedCampaigns: policy.deniedCampaigns,
    maxAbsoluteBudgetDelta: policy.maxAbsoluteBudgetDelta,
    maxPercentageBudgetDelta: policy.maxPercentageBudgetDelta,
    monthlySpendCeiling: policy.monthlySpendCeiling,
    minimumConfidence: policy.minimumConfidence,
    requiredEvidence: policy.requiredEvidence,
    approvalMode: policy.approvalMode,
    requiredApprovalRole: policy.requiredApprovalRole,
    killSwitch: policy.killSwitch,
    dryRunOnly: policy.dryRunOnly,
    executionHours: policy.executionHours,
  };
}
