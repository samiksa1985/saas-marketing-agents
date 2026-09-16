export interface CanonicalApiSession {
  baseUrl: string;
  accessToken: string;
}

export interface CanonicalAgentSummary {
  agentId: string;
  name: string;
  specialty: string;
  category: string;
  active: boolean;
}

export interface CanonicalApprovalSummary {
  id: string;
  tenantId: string;
  artifactId: string;
  decision?: 'approved' | 'approved_with_conditions' | 'rejected' | 'expired';
  conditions?: string[];
}

export interface CanonicalWorkflowSummary {
  id: string;
  tenantId: string;
  status: string;
}

/** Read-only endpoint shapes deliberately omit credentials and mutation calls. */
export interface ProviderBindingSummary { id: string; provider: string; environment: string; configured: boolean; enabled: boolean; executionMode: string; }
export interface ProviderCapabilitySummary { id: string; capability: string; enabled: boolean; operationClassification: string; }
export interface ProviderVerificationSummary { id: string; capability: string; state: string; providerReference?: string; evidence?: unknown; }
export interface LeadSummary { id: string; status?: string; identityId?: string; }
export interface ConversationSummary { id: string; channel?: string; state?: string; }

export type CanonicalReadEndpoint =
  | '/approvals'
  | '/leads'
  | '/opportunities'
  | '/funnel'
  | '/revenue-intelligence'
  | '/revenue-attribution'
  | '/customer-engagement/conversations'
  | '/customer-engagement/handoffs'
  | '/customer-engagement/follow-ups'
  | '/customer-engagement/analytics'
  | '/provider-integrations/bindings'
  | '/provider-integrations/capabilities';

export class CanonicalApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Fetcher = typeof fetch;

/**
 * Read-only client for endpoints already owned by the canonical API.  It does
 * not spoof tenant identity, report a side effect, or introduce a second API.
 */
export class CanonicalApiClient {
  constructor(
    private readonly session: CanonicalApiSession,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async health(): Promise<{ status: string; service: string }> {
    return this.get('/health', false);
  }

  async agents(): Promise<CanonicalAgentSummary[]> {
    return this.get('/agents');
  }

  async approvals(): Promise<CanonicalApprovalSummary[]> {
    return this.get('/approvals');
  }

  async workflow(workflowId: string): Promise<CanonicalWorkflowSummary> {
    return this.get(`/workflows/${encodeURIComponent(workflowId)}`);
  }

  async workflowReadiness(workflowId: string): Promise<unknown> {
    return this.get(`/workflows/${encodeURIComponent(workflowId)}/readiness`);
  }

  async marketingRun(planId: string): Promise<unknown> {
    return this.get(`/marketing-os/runs/${encodeURIComponent(planId)}`);
  }

  async productSurface(surface: string): Promise<ProductSurfaceComposition> {
    return this.get(`/product-surfaces/${encodeURIComponent(surface)}`);
  }

  /** Single authenticated, typed read boundary for commercial product surfaces. */
  async read<T>(path: CanonicalReadEndpoint): Promise<T> {
    return this.get(path);
  }

  providerBindings(): Promise<ProviderBindingSummary[]> {
    return this.read('/provider-integrations/bindings');
  }

  providerCapabilities(): Promise<ProviderCapabilitySummary[]> {
    return this.read('/provider-integrations/capabilities');
  }

  leads(): Promise<LeadSummary[]> { return this.read('/leads'); }
  conversations(): Promise<ConversationSummary[]> { return this.read('/customer-engagement/conversations'); }
  revenueIntelligence(): Promise<unknown> { return this.read('/revenue-intelligence'); }

  private async get<T>(path: string, requiresAuth = true): Promise<T> {
    const response = await this.fetcher(`${this.session.baseUrl.replace(/\/+$/, '')}${path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(requiresAuth ? { authorization: `Bearer ${this.session.accessToken}` } : {}),
      },
    });
    if (!response.ok) {
      throw new CanonicalApiError(
        response.status,
        `Canonical API request failed: ${response.status}`,
      );
    }
    return response.json() as Promise<T>;
  }
}
import type { ProductSurfaceComposition } from '@platform/contracts';
