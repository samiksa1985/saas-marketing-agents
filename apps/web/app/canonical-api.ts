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
