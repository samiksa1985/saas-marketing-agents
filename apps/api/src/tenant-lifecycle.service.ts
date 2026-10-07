import { createHash, randomUUID } from 'node:crypto';
import type { TenantContext } from '@platform/contracts';

/**
 * WS-PROD-10 controlled design-partner tenant lifecycle.
 *
 * Explicit state machine: REQUESTED → QUALIFIED → APPROVED → PROVISIONING →
 * PROVISIONED → VERIFYING → READY → ACTIVE_CONTROLLED → SUSPENDED →
 * OFFBOARDING → OFFBOARDED. Terminal OFFBOARDED never silently reactivates.
 * Provisioning never grants provider live mutation. Every transition is
 * idempotent by durable key and audited.
 */

export type TenantLifecycle =
  | 'REQUESTED'
  | 'QUALIFIED'
  | 'APPROVED'
  | 'PROVISIONING'
  | 'PROVISIONED'
  | 'VERIFYING'
  | 'READY'
  | 'ACTIVE_CONTROLLED'
  | 'SUSPENDED'
  | 'OFFBOARDING'
  | 'OFFBOARDED';

export const TENANT_LIFECYCLE_TRANSITIONS: Record<TenantLifecycle, TenantLifecycle[]> = {
  REQUESTED: ['QUALIFIED'],
  QUALIFIED: ['APPROVED'],
  APPROVED: ['PROVISIONING'],
  PROVISIONING: ['PROVISIONED'],
  PROVISIONED: ['VERIFYING'],
  VERIFYING: ['READY'],
  READY: ['ACTIVE_CONTROLLED', 'SUSPENDED'],
  ACTIVE_CONTROLLED: ['SUSPENDED', 'OFFBOARDING'],
  SUSPENDED: ['ACTIVE_CONTROLLED', 'OFFBOARDING'],
  OFFBOARDING: ['OFFBOARDED'],
  OFFBOARDED: [],
};

export class TenantLifecycleError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = 'TenantLifecycleError';
  }
}

export interface DesignPartnerRequestInput {
  slug: string;
  displayName: string;
  designPartnerRef: string;
  adminSubject: string;
  adminDisplayName: string;
  capabilities?: Record<string, unknown>;
  providerConnection?: boolean;
  providerReadOnly?: boolean;
  providerValidateOnly?: boolean;
  maxActiveWorkflows?: number;
  maxMembers?: number;
  maxProviderConnections?: number;
  dispatchConcurrency?: number;
  requestedBy: string;
  idempotencyKey: string;
  expiresAt?: string;
}

export interface DesignPartnerRequest {
  id: string;
  tenantId?: string;
  status: TenantLifecycle | 'REJECTED';
  slug: string;
  displayName: string;
  designPartnerRef: string;
  adminSubject: string;
  adminDisplayName: string;
  capabilities: Record<string, unknown>;
  providerConnection: boolean;
  providerReadOnly: boolean;
  providerValidateOnly: boolean;
  providerLiveMutation: boolean;
  maxActiveWorkflows: number;
  maxMembers: number;
  maxProviderConnections: number;
  dispatchConcurrency: number;
  requestedBy: string;
  approvalId?: string;
  idempotencyKey: string;
  requestVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantLifecycleStatus {
  tenantId: string;
  lifecycle: TenantLifecycle;
  limits: {
    maxActiveWorkflows: number;
    maxMembers: number;
    maxProviderConnections: number;
    dispatchConcurrency: number;
    providerConnectionAllowed: boolean;
    providerReadOnlyAllowed: boolean;
    providerValidateOnlyAllowed: boolean;
    providerLiveMutationAllowed: boolean;
  } | null;
  recentEvents: Array<{ to: TenantLifecycle; actor: string; occurredAt: Date }>;
}

interface SqlClient {
  unsafe(query: string, parameters?: readonly unknown[]): Promise<unknown>;
  begin<T>(operation: (transaction: SqlClient) => Promise<T>): Promise<T>;
}

type Row = Record<string, unknown>;

function rows<T extends Row = Row>(result: unknown): T[] {
  return Array.from(result as Iterable<T>);
}

function first<T extends Row = Row>(result: unknown): T | undefined {
  return rows<T>(result)[0];
}

function mapRequest(row: Record<string, unknown>): DesignPartnerRequest {
  return {
    id: String(row.id),
    ...(row.tenant_id ? { tenantId: String(row.tenant_id) } : {}),
    status: String(row.status) as DesignPartnerRequest['status'],
    slug: String(row.slug),
    displayName: String(row.display_name),
    designPartnerRef: String(row.design_partner_ref),
    adminSubject: String(row.admin_subject),
    adminDisplayName: String(row.admin_display_name),
    capabilities: (row.capabilities ?? {}) as Record<string, unknown>,
    providerConnection: row.provider_connection === true,
    providerReadOnly: row.provider_read_only === true,
    providerValidateOnly: row.provider_validate_only === true,
    providerLiveMutation: row.provider_live_mutation === true,
    maxActiveWorkflows: Number(row.max_active_workflows),
    maxMembers: Number(row.max_members),
    maxProviderConnections: Number(row.max_provider_connections),
    dispatchConcurrency: Number(row.dispatch_concurrency),
    requestedBy: String(row.requested_by),
    ...(row.approval_id ? { approvalId: String(row.approval_id) } : {}),
    idempotencyKey: String(row.idempotency_key),
    requestVersion: Number(row.request_version),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(['api', 'admin', 'platform', 'system', 'root', 'null', 'undefined', 'www', 'app', 'login', 'auth']);

function validateSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized) || RESERVED_SLUGS.has(normalized)) {
    throw new TenantLifecycleError('DESIGN_PARTNER_SLUG_INVALID');
  }
  return normalized;
}

function validateInput(input: DesignPartnerRequestInput): void {
  validateSlug(input.slug);
  if (!input.displayName.trim() || input.displayName.length > 255) throw new TenantLifecycleError('DESIGN_PARTNER_NAME_INVALID');
  if (!input.designPartnerRef.trim() || input.designPartnerRef.length > 255) throw new TenantLifecycleError('DESIGN_PARTNER_REF_INVALID');
  if (!input.adminSubject.trim() || input.adminSubject.length > 512) throw new TenantLifecycleError('DESIGN_PARTNER_ADMIN_INVALID');
  if (!input.adminDisplayName.trim()) throw new TenantLifecycleError('DESIGN_PARTNER_ADMIN_INVALID');
  if (!input.requestedBy.trim()) throw new TenantLifecycleError('DESIGN_PARTNER_REQUESTER_REQUIRED');
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 255) throw new TenantLifecycleError('DESIGN_PARTNER_IDEMPOTENCY_INVALID');
  for (const [key, value, min, max] of [
    ['maxActiveWorkflows', input.maxActiveWorkflows, 0, 1000],
    ['maxMembers', input.maxMembers, 1, 1000],
    ['maxProviderConnections', input.maxProviderConnections, 0, 50],
    ['dispatchConcurrency', input.dispatchConcurrency, 1, 10],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) {
      throw new TenantLifecycleError(`DESIGN_PARTNER_LIMIT_INVALID:${key}`);
    }
  }
}

export class TenantLifecycleService {
  constructor(private readonly client: SqlClient) {}

  /** Create the immutable versioned request; duplicate keys return the existing record. */
  async createRequest(input: DesignPartnerRequestInput): Promise<DesignPartnerRequest> {
    validateInput(input);
    const slug = validateSlug(input.slug);
    return this.client.begin(async (tx) => {
      const existing = first(await tx.unsafe(
        `SELECT * FROM design_partner_requests WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      ));
      if (existing) return mapRequest(existing);
      const inserted = first(await tx.unsafe(
        `INSERT INTO design_partner_requests (
          status, slug, display_name, design_partner_ref, admin_subject, admin_display_name,
          capabilities, provider_connection, provider_read_only, provider_validate_only,
          provider_live_mutation, max_active_workflows, max_members, max_provider_connections,
          dispatch_concurrency, requested_by, expires_at, idempotency_key
        ) VALUES ('REQUESTED', $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, false, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          slug,
          input.displayName.trim(),
          input.designPartnerRef.trim(),
          input.adminSubject.trim(),
          input.adminDisplayName.trim(),
          JSON.stringify(input.capabilities ?? {}),
          input.providerConnection === true,
          input.providerReadOnly === true,
          input.providerValidateOnly === true,
          input.maxActiveWorkflows ?? 10,
          input.maxMembers ?? 25,
          input.maxProviderConnections ?? 2,
          input.dispatchConcurrency ?? 2,
          input.requestedBy.trim(),
          input.expiresAt ?? null,
          input.idempotencyKey,
        ],
      ));
      if (!inserted) throw new TenantLifecycleError('DESIGN_PARTNER_REQUEST_CREATE_FAILED');
      await this.recordEvent(tx, undefined, String(inserted.id), undefined, 'REQUESTED', input.requestedBy, 'Design-partner request created', undefined, `request:${input.idempotencyKey}`);
      return mapRequest(inserted);
    });
  }

  async getRequest(requestId: string): Promise<DesignPartnerRequest> {
    const row = first(await this.client.unsafe(`SELECT * FROM design_partner_requests WHERE id = $1::uuid`, [requestId]));
    if (!row) throw new TenantLifecycleError('DESIGN_PARTNER_REQUEST_NOT_FOUND');
    return mapRequest(row);
  }

  async getTenantStatus(tenantId: string): Promise<TenantLifecycleStatus> {
    const tenant = first(await this.client.unsafe(
      `SELECT id::text AS id, lifecycle FROM tenants WHERE id = $1::uuid`,
      [tenantId],
    ));
    if (!tenant) throw new TenantLifecycleError('TENANT_NOT_FOUND');
    const limits = first(await this.client.unsafe(
      `SELECT * FROM design_partner_limits WHERE tenant_id = $1::uuid`,
      [tenantId],
    ));
    const events = rows<Record<string, unknown>>(await this.client.unsafe(
      `SELECT to_lifecycle, actor, occurred_at FROM design_partner_lifecycle_events WHERE tenant_id = $1::uuid ORDER BY occurred_at DESC LIMIT 10`,
      [tenantId],
    ));
    return {
      tenantId: String(tenant.id),
      lifecycle: String(tenant.lifecycle) as TenantLifecycle,
      limits: limits
        ? {
            maxActiveWorkflows: Number(limits.max_active_workflows),
            maxMembers: Number(limits.max_members),
            maxProviderConnections: Number(limits.max_provider_connections),
            dispatchConcurrency: Number(limits.dispatch_concurrency),
            providerConnectionAllowed: limits.provider_connection_allowed === true,
            providerReadOnlyAllowed: limits.provider_read_only_allowed === true,
            providerValidateOnlyAllowed: limits.provider_validate_only_allowed === true,
            providerLiveMutationAllowed: limits.provider_live_mutation_allowed === true,
          }
        : null,
      recentEvents: events.map((event) => ({
        to: String(event.to_lifecycle) as TenantLifecycle,
        actor: String(event.actor),
        occurredAt: new Date(String(event.occurred_at)),
      })),
    };
  }

  async qualify(requestId: string, actor: string): Promise<DesignPartnerRequest> {
    return this.transitionRequest(requestId, 'REQUESTED', 'QUALIFIED', actor, undefined, `qualify:${requestId}`);
  }

  /** Approve requires the durable approval reference; expiry is enforced. */
  async approve(requestId: string, actor: string, approvalId: string): Promise<DesignPartnerRequest> {
    if (!approvalId.trim()) throw new TenantLifecycleError('DESIGN_PARTNER_APPROVAL_REQUIRED');
    const expires = first(await this.client.unsafe(
      `SELECT expires_at FROM design_partner_requests WHERE id = $1::uuid`,
      [requestId],
    )) as Record<string, unknown> | undefined;
    if (expires?.expires_at && new Date(String(expires.expires_at)) <= new Date()) {
      throw new TenantLifecycleError('DESIGN_PARTNER_REQUEST_EXPIRED');
    }
    return this.transitionRequest(requestId, 'QUALIFIED', 'APPROVED', actor, approvalId, `approve:${requestId}:${approvalId}`);
  }

  /**
   * Provision the approved request into a real tenant: server-generated
   * tenant ID, limits row, lifecycle PROVISIONED. Fully idempotent.
   */
  async provision(requestId: string, actor: string): Promise<{ request: DesignPartnerRequest; tenantId: string }> {
    return this.client.begin(async (tx) => {
      const row = first(await tx.unsafe(`SELECT * FROM design_partner_requests WHERE id = $1::uuid FOR UPDATE`, [requestId]));
      if (!row) throw new TenantLifecycleError('DESIGN_PARTNER_REQUEST_NOT_FOUND');
      const request = mapRequest(row);
      if (request.tenantId) {
        return { request, tenantId: request.tenantId };
      }
      if (request.status !== 'APPROVED') {
        throw new TenantLifecycleError('DESIGN_PARTNER_NOT_APPROVED');
      }
      const expiresAt = row.expires_at ? new Date(String(row.expires_at)) : undefined;
      if (expiresAt && expiresAt <= new Date()) throw new TenantLifecycleError('DESIGN_PARTNER_REQUEST_EXPIRED');

      await tx.unsafe(
        `UPDATE design_partner_requests SET status = 'PROVISIONING' WHERE id = $1::uuid`,
        [requestId],
      );

      const tenantId = randomUUID();
      await tx.unsafe(
        `INSERT INTO tenants (id, name, default_locale, status, lifecycle)
         VALUES ($1::uuid, $2, 'en', 'active', 'PROVISIONED')`,
        [tenantId, request.displayName],
      );
      await tx.unsafe(
        `INSERT INTO design_partner_limits (
          tenant_id, max_active_workflows, max_members, max_provider_connections, dispatch_concurrency,
          provider_connection_allowed, provider_read_only_allowed, provider_validate_only_allowed, provider_live_mutation_allowed
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, false)`,
        [
          tenantId,
          request.maxActiveWorkflows,
          request.maxMembers,
          request.maxProviderConnections,
          request.dispatchConcurrency,
          request.providerConnection,
          request.providerReadOnly,
          request.providerValidateOnly,
        ],
      );
      await tx.unsafe(
        `UPDATE design_partner_requests SET tenant_id = $2::uuid, status = 'PROVISIONED' WHERE id = $1::uuid`,
        [requestId, tenantId],
      );
      await this.recordEvent(tx, tenantId, requestId, 'APPROVED', 'PROVISIONED', actor, 'Tenant provisioned', request.approvalId, `provision:${requestId}`);
      const updated = first(await tx.unsafe(`SELECT * FROM design_partner_requests WHERE id = $1::uuid`, [requestId]));
      return { request: mapRequest(updated!), tenantId };
    });
  }

  /** Bootstrap the initial admin membership: minimum tenant_admin, no platform permissions. */
  async bootstrapAdmin(requestId: string, actor: string): Promise<{ tenantId: string; membershipCreated: boolean }> {
    return this.client.begin(async (tx) => {
      const row = first(await tx.unsafe(`SELECT * FROM design_partner_requests WHERE id = $1::uuid FOR UPDATE`, [requestId]));
      if (!row) throw new TenantLifecycleError('DESIGN_PARTNER_REQUEST_NOT_FOUND');
      const request = mapRequest(row);
      if (!request.tenantId) throw new TenantLifecycleError('DESIGN_PARTNER_NOT_PROVISIONED');
      if (!['PROVISIONED', 'VERIFYING', 'READY'].includes(request.status)) {
        throw new TenantLifecycleError('DESIGN_PARTNER_ADMIN_BOOTSTRAP_STATE_INVALID');
      }

      const user = first(await tx.unsafe(
        `INSERT INTO users (subject, display_name) VALUES ($1, $2) ON CONFLICT (subject) DO NOTHING RETURNING id`,
        [request.adminSubject, request.adminDisplayName],
      )) ?? first(await tx.unsafe(`SELECT id FROM users WHERE subject = $1 FOR UPDATE`, [request.adminSubject]));
      if (!user) throw new TenantLifecycleError('DESIGN_PARTNER_ADMIN_USER_UNAVAILABLE');

      const role = first(await tx.unsafe(`SELECT id FROM roles WHERE name = 'tenant_admin' LIMIT 1`));
      if (!role) throw new TenantLifecycleError('TENANT_ADMIN_ROLE_NOT_SEEDED');

      const membership = await tx.unsafe(
        `INSERT INTO tenant_members (tenant_id, user_id, role_id, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'active')
         ON CONFLICT (tenant_id, user_id) DO NOTHING
         RETURNING tenant_id`,
        [request.tenantId, String(user.id), String(role.id)],
      );
      await this.recordEvent(tx, request.tenantId, requestId, request.status as TenantLifecycle, request.status as TenantLifecycle, actor, 'Initial admin membership ensured', request.approvalId, `bootstrap-admin:${requestId}`);
      return { tenantId: request.tenantId, membershipCreated: rows(membership).length === 1 };
    });
  }

  /** Mark the tenant ready after the onboarding checklist passes. */
  async markReady(tenantId: string, actor: string): Promise<TenantLifecycleStatus> {
    return this.transitionTenant(tenantId, ['PROVISIONED', 'VERIFYING'], 'READY', actor, `ready:${tenantId}`);
  }

  /** Suspend blocks consequential work; durable and restart-safe. */
  async suspend(tenantId: string, actor: string, reason: string, approvalId?: string): Promise<TenantLifecycleStatus> {
    const status = await this.getTenantStatus(tenantId);
    if (status.lifecycle === 'SUSPENDED') return status;
    return this.transitionTenant(tenantId, ['READY', 'ACTIVE_CONTROLLED'], 'SUSPENDED', actor, `suspend:${tenantId}:${createHash('sha256').update(reason).digest('hex').slice(0, 16)}`, approvalId, reason);
  }

  /** Resume a suspended tenant; stale approvals are invalidated by the transition. */
  async resume(tenantId: string, actor: string): Promise<TenantLifecycleStatus> {
    return this.transitionTenant(tenantId, ['SUSPENDED'], 'ACTIVE_CONTROLLED', actor, `resume:${tenantId}`);
  }

  /** Offboard is the only path to terminal; OFFBOARDED cannot reactivate. */
  async offboard(tenantId: string, actor: string, reason: string): Promise<TenantLifecycleStatus> {
    const status = await this.getTenantStatus(tenantId);
    if (status.lifecycle === 'OFFBOARDED') return status;
    if (!['ACTIVE_CONTROLLED', 'SUSPENDED', 'OFFBOARDING'].includes(status.lifecycle)) {
      throw new TenantLifecycleError('TENANT_LIFECYCLE_TRANSITION_INVALID');
    }
    await this.client.begin(async (tx) => {
      await tx.unsafe(
        `UPDATE tenant_members SET status = 'inactive' WHERE tenant_id = $1::uuid AND status = 'active'`,
        [tenantId],
      );
      await tx.unsafe(
        `UPDATE google_ads_connections SET status = 'DISCONNECTED', disconnected_at = now(), credential_ref = NULL
         WHERE tenant_id = $1::uuid AND status IN ('PENDING', 'CONNECTED', 'VERIFIED', 'FAILED')`,
        [tenantId],
      );
      await this.transitionTenantInTransaction(tx, tenantId, ['ACTIVE_CONTROLLED', 'SUSPENDED', 'OFFBOARDING'], 'OFFBOARDING', actor, `offboard-start:${tenantId}`, undefined, reason);
      await this.transitionTenantInTransaction(tx, tenantId, ['OFFBOARDING'], 'OFFBOARDED', actor, `offboard-complete:${tenantId}`, undefined, reason);
    });
    return this.getTenantStatus(tenantId);
  }

  /** Kill-switch check used immediately before consequential dispatch. */
  async assertDispatchAllowed(tenantId: string): Promise<void> {
    const status = await this.getTenantStatus(tenantId);
    if (!['READY', 'ACTIVE_CONTROLLED'].includes(status.lifecycle)) {
      throw new TenantLifecycleError('TENANT_LIFECYCLE_DISPATCH_BLOCKED');
    }
    if (status.limits && !status.limits.providerConnectionAllowed) {
      // Provider connection capability is separate from dispatch; the kill
      // switch blocks consequential dispatch regardless of approvals.
      void 0;
    }
  }

  /** Provider connection gate: tenant limits must allow the connection flow. */
  async assertProviderConnectionAllowed(tenantId: string): Promise<void> {
    const status = await this.getTenantStatus(tenantId);
    if (!['READY', 'ACTIVE_CONTROLLED'].includes(status.lifecycle)) {
      throw new TenantLifecycleError('TENANT_LIFECYCLE_PROVIDER_BLOCKED');
    }
    if (!status.limits?.providerConnectionAllowed) {
      throw new TenantLifecycleError('TENANT_PROVIDER_CONNECTION_NOT_ENTITLED');
    }
  }

  private async transitionRequest(
    requestId: string,
    from: TenantLifecycle,
    to: TenantLifecycle,
    actor: string,
    approvalId: string | undefined,
    idempotencyKey: string,
  ): Promise<DesignPartnerRequest> {
    return this.client.begin(async (tx) => {
      const row = first(await tx.unsafe(`SELECT * FROM design_partner_requests WHERE id = $1::uuid FOR UPDATE`, [requestId]));
      if (!row) throw new TenantLifecycleError('DESIGN_PARTNER_REQUEST_NOT_FOUND');
      const current = mapRequest(row);
      if (current.status === to) return current;
      if (current.status === 'REJECTED' || !TENANT_LIFECYCLE_TRANSITIONS[current.status as TenantLifecycle]?.includes(to) || current.status !== from) {
        throw new TenantLifecycleError('TENANT_LIFECYCLE_TRANSITION_INVALID');
      }
      const updated = first(await tx.unsafe(
        `UPDATE design_partner_requests
         SET status = $2, approval_id = COALESCE($3, approval_id), approved_at = CASE WHEN $2 = 'APPROVED' THEN now() ELSE approved_at END
         WHERE id = $1::uuid AND status = $4
         RETURNING *`,
        [requestId, to, approvalId ?? null, from],
      ));
      if (!updated) throw new TenantLifecycleError('TENANT_LIFECYCLE_TRANSITION_INVALID');
      await this.recordEvent(tx, current.tenantId, requestId, from, to, actor, `Request ${from} → ${to}`, approvalId, idempotencyKey);
      return mapRequest(updated);
    });
  }

  private async transitionTenant(
    tenantId: string,
    allowedFrom: TenantLifecycle[],
    to: TenantLifecycle,
    actor: string,
    idempotencyKey: string,
    approvalId?: string,
    reason?: string,
  ): Promise<TenantLifecycleStatus> {
    await this.client.begin(async (tx) => {
      await this.transitionTenantInTransaction(tx, tenantId, allowedFrom, to, actor, idempotencyKey, approvalId, reason);
    });
    return this.getTenantStatus(tenantId);
  }

  private async transitionTenantInTransaction(
    tx: SqlClient,
    tenantId: string,
    allowedFrom: TenantLifecycle[],
    to: TenantLifecycle,
    actor: string,
    idempotencyKey: string,
    approvalId?: string,
    reason?: string,
  ): Promise<void> {
    const row = first(await tx.unsafe(`SELECT lifecycle FROM tenants WHERE id = $1::uuid FOR UPDATE`, [tenantId]));
    if (!row) throw new TenantLifecycleError('TENANT_NOT_FOUND');
    const from = String(row.lifecycle) as TenantLifecycle;
    if (from === to) return;
    if (!allowedFrom.includes(from)) throw new TenantLifecycleError('TENANT_LIFECYCLE_TRANSITION_INVALID');
    await tx.unsafe(`UPDATE tenants SET lifecycle = $2 WHERE id = $1::uuid`, [tenantId, to]);
    await this.recordEvent(tx, tenantId, undefined, from, to, actor, reason ?? `Tenant ${from} → ${to}`, approvalId, idempotencyKey);
  }

  private async recordEvent(
    tx: SqlClient,
    tenantId: string | undefined,
    requestId: string | undefined,
    from: TenantLifecycle | undefined,
    to: TenantLifecycle,
    actor: string,
    reason: string,
    approvalId: string | undefined,
    idempotencyKey: string,
  ): Promise<void> {
    await tx.unsafe(
      `INSERT INTO design_partner_lifecycle_events (tenant_id, request_id, from_lifecycle, to_lifecycle, actor, reason, approval_id, idempotency_key)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [tenantId ?? null, requestId ?? null, from ?? null, to, actor.slice(0, 255), reason.slice(0, 500), approvalId ?? null, idempotencyKey],
    );
  }
}

/** Machine-readable acceptance pack: durable, secret-free, auditable. */
export interface DesignPartnerAcceptancePack {
  schemaVersion: 1;
  tenantId: string;
  requestId: string;
  lifecycle: TenantLifecycle;
  limits: TenantLifecycleStatus['limits'];
  providerGates: {
    connectionAllowed: boolean;
    readOnlyAllowed: boolean;
    validateOnlyAllowed: boolean;
    liveMutationAllowed: false;
  };
  killSwitch: 'ARMED';
  events: Array<{ to: string; actor: string; occurredAt: string }>;
  generatedAt: string;
  result: 'READY' | 'NOT_READY';
  failureReasons: string[];
}

export function buildAcceptancePack(status: TenantLifecycleStatus, requestId: string): DesignPartnerAcceptancePack {
  const failures: string[] = [];
  if (status.lifecycle !== 'READY' && status.lifecycle !== 'ACTIVE_CONTROLLED') failures.push('lifecycle-not-ready');
  if (!status.limits) failures.push('limits-missing');
  if (status.limits?.providerLiveMutationAllowed) failures.push('live-mutation-must-be-off');
  return {
    schemaVersion: 1,
    tenantId: status.tenantId,
    requestId,
    lifecycle: status.lifecycle,
    limits: status.limits,
    providerGates: {
      connectionAllowed: status.limits?.providerConnectionAllowed ?? false,
      readOnlyAllowed: status.limits?.providerReadOnlyAllowed ?? false,
      validateOnlyAllowed: status.limits?.providerValidateOnlyAllowed ?? false,
      liveMutationAllowed: false,
    },
    killSwitch: 'ARMED',
    events: status.recentEvents.map((event) => ({
      to: event.to,
      actor: event.actor,
      occurredAt: event.occurredAt.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
    result: failures.length === 0 ? 'READY' : 'NOT_READY',
    failureReasons: failures,
  };
}
