export interface CanonicalApiSession {
  baseUrl: string;
  accessToken: string;
}

export interface PilotApiSession {
  baseUrl: string;
  mode: 'pilot';
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
export interface ProviderBindingSummary {
  id: string;
  provider: string;
  environment: string;
  configured: boolean;
  enabled: boolean;
  executionMode: string;
}
export interface ProviderCapabilitySummary {
  id: string;
  capability: string;
  enabled: boolean;
  operationClassification: string;
}
export interface ProviderVerificationSummary {
  id: string;
  capability: string;
  state: string;
  providerReference?: string;
  evidence?: unknown;
}
export interface CampaignRevenueMetrics {
  campaignId: string;
  currency: string | 'UNKNOWN';
  leads: number;
  qualifiedLeads: number;
  opportunities: number;
  closedWonRevenueMinor: number | 'UNKNOWN';
  pipelineValueMinor: number | 'UNKNOWN';
  cplMinor: number | 'UNKNOWN';
  cpqlMinor: number | 'UNKNOWN';
  costPerOpportunityMinor: number | 'UNKNOWN';
  cacMinor: number | 'UNKNOWN';
  roas: number | 'UNKNOWN';
  reasons: string[];
}
export interface FunnelTransition {
  transitionId: string;
  tenantId: string;
  leadId?: string;
  opportunityId?: string;
  fromStage?: string;
  toStage: string;
  occurredAt: string;
  sourceCampaignId?: string;
  evidenceRefs: unknown[];
}
export interface LeadSummary {
  id: string;
  status?: string;
  identityId?: string;
}
export interface ConversationSummary {
  id: string;
  channel?: string;
  state?: string;
}

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
  | '/customer-journey/analytics'
  | '/provider-integrations/bindings'
  | '/provider-integrations/capabilities'
  | '/acquisition-diagnostics'
  | '/lead-routing-recommendations';

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
    private readonly session: CanonicalApiSession | PilotApiSession,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  private isPilot(): boolean {
    return 'mode' in this.session && this.session.mode === 'pilot';
  }

  private getPilotUrl(path: string): string {
    const base = (this.session as CanonicalApiSession).baseUrl?.replace(/\/+$/, '') || '';
    return `${base}/api/pilot${path}`;
  }

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

  leads(): Promise<LeadSummary[]> {
    return this.read('/leads');
  }
  conversations(): Promise<ConversationSummary[]> {
    return this.read('/customer-engagement/conversations');
  }
  revenueIntelligence(): Promise<CampaignRevenueMetrics[]> {
    return this.read('/revenue-intelligence');
  }

  acquisitionDiagnostics(): Promise<unknown> {
    return this.read('/acquisition-diagnostics');
  }

  leadRoutingRecommendations(): Promise<unknown> {
    return this.read('/lead-routing-recommendations');
  }

  funnel(): Promise<FunnelTransition[]> {
    return this.read('/funnel');
  }

  private async get<T>(path: string, requiresAuth = true): Promise<T> {
    const isPilot = this.isPilot();
    const url = isPilot
      ? this.getPilotUrl(path)
      : `${this.session.baseUrl.replace(/\/+$/, '')}${path}`;

    const headers: Record<string, string> = { accept: 'application/json' };
    if (requiresAuth && !isPilot) {
      headers.authorization = `Bearer ${(this.session as CanonicalApiSession).accessToken}`;
    }

    const response = await this.fetcher(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
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
