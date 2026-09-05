import type {
  EntitlementDecision,
} from '@platform/contracts';

import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentExecutor,
} from './index.js';

export const AI_REQUEST_ENTITLEMENT =
  'ai.requests.monthly';

export interface AgentEntitlementAccess {
  authorize(
    tenantId: string,
    entitlementKey: string,
  ): Promise<EntitlementDecision>;

  consume(
    tenantId: string,
    entitlementKey: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<void>;
}

function assertDecision(
  tenantId: string,
  decision: EntitlementDecision,
): void {
  if (
    decision.tenantId !== tenantId
  ) {
    throw new Error(
      'Cross-tenant entitlement decision denied',
    );
  }

  if (!decision.allowed) {
    throw new Error(
      `Entitlement denied: ${decision.key} - ${decision.reason}`,
    );
  }
}

export class EntitlementAwareAgentExecutor
  implements AgentExecutor
{
  constructor(
    private readonly inner: AgentExecutor,
    private readonly access: AgentEntitlementAccess,
  ) {}

  async execute(
    request: AgentExecutionRequest,
  ): Promise<AgentExecutionResult> {
    const tenantId =
      request.tenantContext?.tenantId;

    if (!tenantId) {
      throw new Error(
        'Agent execution requires tenant context',
      );
    }

    const decision =
      await this.access.authorize(
        tenantId,
        AI_REQUEST_ENTITLEMENT,
      );

    assertDecision(
      tenantId,
      decision,
    );

    /*
     * Reserve quota atomically before provider execution.
     *
     * The access layer must implement consumption
     * idempotently and atomically. Once reserved, the
     * request is billable even if the provider later fails.
     *
     * Validation performed before this executor still
     * consumes nothing.
     */
    await this.access.consume(
      tenantId,
      AI_REQUEST_ENTITLEMENT,
      1,
      request.idempotencyKey,
    );

    return this.inner.execute(
      request,
    );
  }
}
