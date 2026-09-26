import type { TenantContext } from '@platform/contracts';

export type ProviderOperationClassification = 'READ_ONLY' | 'INTERNAL_NON_CONSEQUENTIAL' | 'EXTERNAL_CONSEQUENTIAL';
export type ProviderExecutionMode = 'DISABLED' | 'MOCK' | 'REAL';
export type ProviderEnvironment = 'SANDBOX' | 'PRODUCTION';
export type ProviderHealthState = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
export type CredentialHealthState = 'VALID' | 'INVALID' | 'MISSING' | 'UNKNOWN';
export type ProviderVerificationState = 'REQUESTED' | 'DISPATCHED' | 'PROVIDER_ACCEPTED' | 'EXECUTED_UNVERIFIED' | 'VERIFIED' | 'FAILED' | 'UNCERTAIN';
export type ProviderCapabilityId =
  | 'PAID_MEDIA_GOOGLE' | 'PAID_MEDIA_META'
  | 'CRM_CONTACT_READ' | 'CRM_CONTACT_WRITE' | 'CRM_LEAD_READ' | 'CRM_LEAD_WRITE'
  | 'CRM_OPPORTUNITY_READ' | 'CRM_OPPORTUNITY_WRITE' | 'CRM_TASK_CREATE'
  | 'EMAIL_SEND' | 'SMS_SEND' | 'WHATSAPP_SEND'
  | 'REPUTATION' | 'LOCAL_PRESENCE' | 'AI_RECEPTIONIST' | 'MEETING_SCHEDULING';
export type ProviderId = 'GOOGLE_ADS' | 'META_ADS' | 'CRM_MOCK' | 'COMMUNICATION_MOCK' | 'VENDasta' | 'HUBSPOT' | 'SALESFORCE' | 'DYNAMICS_365' | 'CUSTOM';
/** Catalog metadata is declarative only; it neither configures a tenant nor enables a provider. */
export const providerCapabilityCatalog: Readonly<Record<ProviderId, readonly ProviderCapabilityId[]>> = {
  GOOGLE_ADS: ['PAID_MEDIA_GOOGLE'], META_ADS: ['PAID_MEDIA_META'],
  CRM_MOCK: ['CRM_CONTACT_READ','CRM_CONTACT_WRITE','CRM_LEAD_READ','CRM_LEAD_WRITE','CRM_OPPORTUNITY_READ','CRM_OPPORTUNITY_WRITE','CRM_TASK_CREATE'],
  COMMUNICATION_MOCK: ['EMAIL_SEND','SMS_SEND','WHATSAPP_SEND'],
  VENDasta: ['CRM_CONTACT_READ','CRM_CONTACT_WRITE','CRM_LEAD_READ','CRM_LEAD_WRITE','CRM_OPPORTUNITY_READ','CRM_OPPORTUNITY_WRITE','CRM_TASK_CREATE'],
  HUBSPOT: ['CRM_CONTACT_READ','CRM_CONTACT_WRITE','CRM_LEAD_READ','CRM_LEAD_WRITE','CRM_OPPORTUNITY_READ','CRM_OPPORTUNITY_WRITE','CRM_TASK_CREATE'],
  SALESFORCE: ['CRM_CONTACT_READ','CRM_CONTACT_WRITE','CRM_LEAD_READ','CRM_LEAD_WRITE','CRM_OPPORTUNITY_READ','CRM_OPPORTUNITY_WRITE','CRM_TASK_CREATE'],
  DYNAMICS_365: ['CRM_CONTACT_READ','CRM_CONTACT_WRITE','CRM_LEAD_READ','CRM_LEAD_WRITE','CRM_OPPORTUNITY_READ','CRM_OPPORTUNITY_WRITE','CRM_TASK_CREATE'],
  CUSTOM: ['CRM_CONTACT_READ','CRM_CONTACT_WRITE','CRM_LEAD_READ','CRM_LEAD_WRITE','CRM_OPPORTUNITY_READ','CRM_OPPORTUNITY_WRITE','CRM_TASK_CREATE'],
};

export interface ProviderBinding {
  id: string; tenantId: string; provider: ProviderId; environment: ProviderEnvironment; executionMode: ProviderExecutionMode;
  configured: boolean; enabled: boolean; credentialReference?: string; adapterVersion: string; createdAt: string; updatedAt: string;
}
export interface ProviderCapabilityBinding { id: string; tenantId: string; bindingId: string; capability: ProviderCapabilityId; enabled: boolean; operation: ProviderOperationClassification; supported: boolean; idempotencyKey: string; }
export interface ProviderReadiness { binding: ProviderBinding; capability: ProviderCapabilityBinding; providerHealth: ProviderHealthState; credentialHealth: CredentialHealthState; readiness: 'READ_READY' | 'MUTATION_READY' | 'MUTATION_DISABLED' | 'DEFERRED'; }
export interface ProviderVerificationResult { state: ProviderVerificationState; providerReference?: string; evidence: Record<string, unknown>; }
export interface ProviderIntegrationAdapter {
  readonly provider: ProviderId;
  capabilities(): readonly ProviderCapabilityId[];
  read?(context: TenantContext, input: unknown): Promise<unknown>;
  propose?(context: TenantContext, input: unknown): Promise<unknown>;
  executeGoverned?(context: TenantContext, dispatch: { approved: true; idempotencyKey: string; operationId: string }, input: unknown): Promise<{ providerReference: string; state: 'PROVIDER_ACCEPTED' | 'EXECUTED_UNVERIFIED' }>;
  verify?(context: TenantContext, providerReference: string): Promise<ProviderVerificationResult>;
  health?(context: TenantContext): Promise<ProviderHealthState>;
}

export class ProviderIntegrationRuntimeError extends Error { constructor(readonly code: string) { super(code); this.name = 'ProviderIntegrationRuntimeError'; } }
const isConsequential = (operation: ProviderOperationClassification) => operation === 'EXTERNAL_CONSEQUENTIAL';

/** Pure resolver: it never falls back to another provider and never executes a mutation. */
export class ProviderIntegrationRuntime {
  resolve(context: TenantContext, input: { capability: ProviderCapabilityId; operation: ProviderOperationClassification; environment: ProviderEnvironment; bindings: ProviderBinding[]; capabilities: ProviderCapabilityBinding[]; providerHealth: ProviderHealthState; credentialHealth: CredentialHealthState; }): ProviderReadiness {
    if (!context.tenantId) throw new ProviderIntegrationRuntimeError('TENANT_SCOPE_DENIED');
    if (!['READ_ONLY', 'INTERNAL_NON_CONSEQUENTIAL', 'EXTERNAL_CONSEQUENTIAL'].includes(input.operation)) throw new ProviderIntegrationRuntimeError('PROVIDER_OPERATION_CLASSIFICATION_UNKNOWN');
    const capability = input.capabilities.find((item) => item.tenantId === context.tenantId && item.capability === input.capability);
    if (!capability || !capability.supported) throw new ProviderIntegrationRuntimeError('PROVIDER_CAPABILITY_UNBOUND');
    if (capability.operation !== input.operation) throw new ProviderIntegrationRuntimeError('PROVIDER_OPERATION_CLASSIFICATION_MISMATCH');
    const binding = input.bindings.find((item) => item.tenantId === context.tenantId && item.id === capability.bindingId && item.environment === input.environment);
    if (!binding) throw new ProviderIntegrationRuntimeError('PROVIDER_BINDING_UNAVAILABLE');
    if (!binding.configured) throw new ProviderIntegrationRuntimeError('PROVIDER_UNCONFIGURED');
    if (!binding.enabled || !capability.enabled) throw new ProviderIntegrationRuntimeError('PROVIDER_CAPABILITY_DISABLED');
    if (input.credentialHealth !== 'VALID') throw new ProviderIntegrationRuntimeError('PROVIDER_CREDENTIAL_NOT_VALID');
    if (input.providerHealth !== 'HEALTHY') throw new ProviderIntegrationRuntimeError('PROVIDER_HEALTH_NOT_READY');
    const readiness = isConsequential(input.operation)
      ? binding.executionMode === 'REAL' ? 'MUTATION_READY' : 'MUTATION_DISABLED'
      : 'READ_READY';
    return { binding, capability, providerHealth: input.providerHealth, credentialHealth: input.credentialHealth, readiness };
  }
}

/** Deterministic acceptance-only CRM adapter. Its governed method cannot be called without an approved dispatch. */
export class MockCrmProviderAdapter implements ProviderIntegrationAdapter {
  readonly provider: ProviderId = 'CRM_MOCK'; private readonly contacts = new Map<string, Record<string, unknown>>(); private readonly mutations = new Map<string, string>();
  capabilities() { return ['CRM_CONTACT_READ','CRM_CONTACT_WRITE','CRM_LEAD_READ','CRM_LEAD_WRITE','CRM_OPPORTUNITY_READ','CRM_OPPORTUNITY_WRITE','CRM_TASK_CREATE'] as const; }
  async read(context: TenantContext, input: unknown) { if (!context.tenantId) throw new ProviderIntegrationRuntimeError('TENANT_SCOPE_DENIED'); const key = String((input as { reference?: string }).reference ?? ''); return this.contacts.get(`${context.tenantId}:${key}`); }
  async executeGoverned(context: TenantContext, dispatch: { approved: true; idempotencyKey: string; operationId: string }, input: unknown) { if (!context.tenantId || dispatch.approved !== true) throw new ProviderIntegrationRuntimeError('GOVERNED_APPROVAL_REQUIRED'); const existing = this.mutations.get(`${context.tenantId}:${dispatch.idempotencyKey}`); if (existing) return { providerReference: existing, state: 'EXECUTED_UNVERIFIED' as const }; const reference = `mock-crm:${dispatch.operationId}`; this.contacts.set(`${context.tenantId}:${reference}`, { reference, input }); this.mutations.set(`${context.tenantId}:${dispatch.idempotencyKey}`, reference); return { providerReference: reference, state: 'EXECUTED_UNVERIFIED' as const }; }
  async verify(context: TenantContext, providerReference: string) { if (!context.tenantId) throw new ProviderIntegrationRuntimeError('TENANT_SCOPE_DENIED'); return { state: 'VERIFIED' as const, providerReference, evidence: { source: 'MOCK_CRM', causalClaim: 'NONE' } }; }
}

/** Deterministic acceptance-only communications adapter; it never contacts a live customer. */
export class MockCommunicationProviderAdapter implements ProviderIntegrationAdapter {
  readonly provider: ProviderId = 'COMMUNICATION_MOCK'; private readonly deliveries = new Map<string, string>();
  capabilities() { return ['EMAIL_SEND','SMS_SEND','WHATSAPP_SEND'] as const; }
  async executeGoverned(context: TenantContext, dispatch: { approved: true; idempotencyKey: string; operationId: string }) { if (!context.tenantId || dispatch.approved !== true) throw new ProviderIntegrationRuntimeError('GOVERNED_APPROVAL_REQUIRED'); const key=`${context.tenantId}:${dispatch.idempotencyKey}`; const existing=this.deliveries.get(key); if(existing)return {providerReference:existing,state:'PROVIDER_ACCEPTED' as const}; const reference=`mock-communication:${dispatch.operationId}`; this.deliveries.set(key,reference); return {providerReference:reference,state:'PROVIDER_ACCEPTED' as const}; }
  async verify(context: TenantContext, providerReference: string) { if (!context.tenantId) throw new ProviderIntegrationRuntimeError('TENANT_SCOPE_DENIED'); return { state: 'EXECUTED_UNVERIFIED' as const, providerReference, evidence: { source: 'MOCK_COMMUNICATION', delivery: 'ACCEPTED_NOT_INDEPENDENTLY_VERIFIED' } }; }
}
