import type {
  ChurnRiskLevel,
  CustomerHealthAssessment,
  CustomerHealthStatus,
  CustomerSuccessAssessmentInput,
  ExpansionOpportunityAssessment,
  RenewalRecommendation,
  TenantContext,
} from '@platform/contracts';

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function assertTenant(
  context: TenantContext,
  tenantId: string,
): void {
  if (
    !context.tenantId ||
    context.tenantId !== tenantId
  ) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

function statusFor(
  score: number,
): CustomerHealthStatus {
  if (score < 40) return 'CRITICAL';
  if (score < 60) return 'AT_RISK';
  if (score < 75) return 'WATCH';
  return 'HEALTHY';
}

function churnFor(
  score: number,
  paymentRisk: boolean,
  daysToRenewal?: number,
): ChurnRiskLevel {
  if (
    score < 40 ||
    (paymentRisk && score < 60)
  ) {
    return 'CRITICAL';
  }

  if (
    score < 60 ||
    (
      daysToRenewal !== undefined &&
      daysToRenewal <= 30 &&
      score < 70
    )
  ) {
    return 'HIGH';
  }

  if (score < 75 || paymentRisk) {
    return 'MEDIUM';
  }

  return 'LOW';
}

export function assessCustomerHealth(
  context: TenantContext,
  input: CustomerSuccessAssessmentInput,
): CustomerHealthAssessment {
  assertTenant(context, input.tenantId);

  const engagement =
    clamp(input.engagementScore);

  const delivery =
    clamp(input.deliveryScore);

  const outcome =
    clamp(input.outcomeScore);

  const satisfaction =
    clamp(input.satisfactionScore);

  let score =
    engagement * 0.25 +
    delivery * 0.25 +
    outcome * 0.30 +
    satisfaction * 0.20;

  score -= Math.min(
    20,
    Math.max(0, input.unresolvedIssues) * 4,
  );

  if (
    input.daysToRenewal !== undefined &&
    input.daysToRenewal <= 30 &&
    score < 70
  ) {
    score -= 5;
  }

  if (input.paymentRisk) {
    score -= 10;
  }

  if (
    input.usageScore !== undefined &&
    input.usageScore < 40
  ) {
    score -= 5;
  }

  score = Math.round(clamp(score));

  const causes: string[] = [];
  const actions: string[] = [];

  if (engagement < 60) {
    causes.push('LOW_ENGAGEMENT');
    actions.push(
      'Review customer engagement and stakeholder participation.',
    );
  }

  if (delivery < 60) {
    causes.push('DELIVERY_RISK');
    actions.push(
      'Run a delivery recovery review.',
    );
  }

  if (outcome < 60) {
    causes.push('OUTCOME_RISK');
    actions.push(
      'Review strategy and measurable customer outcomes.',
    );
  }

  if (satisfaction < 60) {
    causes.push('SATISFACTION_RISK');
    actions.push(
      'Open a customer satisfaction recovery action.',
    );
  }

  if (input.unresolvedIssues > 0) {
    causes.push('UNRESOLVED_ISSUES');
    actions.push(
      'Resolve outstanding customer issues.',
    );
  }

  if (input.paymentRisk) {
    causes.push('PAYMENT_RISK');
    actions.push(
      'Review billing and payment risk.',
    );
  }

  if (
    input.daysToRenewal !== undefined &&
    input.daysToRenewal <= 30
  ) {
    causes.push('RENEWAL_WINDOW');
    actions.push(
      'Start governed renewal review.',
    );
  }

  const evidenceIds = [
    ...new Set(input.evidenceIds ?? []),
  ];

  const completeness = [
    engagement,
    delivery,
    outcome,
    satisfaction,
  ].filter(
    (value) => Number.isFinite(value),
  ).length / 4;

  return {
    id:
      `health:${input.tenantId}:${input.customerId}:${input.assessedAt ?? 'current'}`,
    tenantId: input.tenantId,
    customerId: input.customerId,
    ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    score,
    status: statusFor(score),
    churnRisk: churnFor(
      score,
      Boolean(input.paymentRisk),
      input.daysToRenewal,
    ),
    causes,
    actions,
    evidenceIds,
    confidence:
      Math.round(completeness * 100),
    model:
      'canonical-customer-health-v1',
    assessedAt:
      input.assessedAt ??
      new Date().toISOString(),
  };
}

export function recommendRenewal(
  context: TenantContext,
  health: CustomerHealthAssessment,
  daysToRenewal?: number,
): RenewalRecommendation {
  assertTenant(context, health.tenantId);

  let recommendation:
    RenewalRecommendation['recommendation'] =
      'RENEW';

  if (health.status === 'CRITICAL') {
    recommendation =
      'EXECUTIVE_REVIEW';
  } else if (
    health.status === 'AT_RISK'
  ) {
    recommendation =
      'RENEW_WITH_RECOVERY_PLAN';
  } else if (
    health.churnRisk === 'HIGH'
  ) {
    recommendation =
      'RENEW_WITH_RECOVERY_PLAN';
  }

  return {
    id:
      `renewal:${health.tenantId}:${health.customerId}:${health.id}`,
    tenantId: health.tenantId,
    customerId: health.customerId,
    ...(health.accountId !== undefined ? { accountId: health.accountId } : {}),
    healthAssessmentId: health.id,
    ...(daysToRenewal !== undefined ? { daysToRenewal } : {}),
    recommendation,
    rationale: [
      `Health status: ${health.status}`,
      `Churn risk: ${health.churnRisk}`,
      ...health.causes,
    ],
    actions: [
      ...health.actions,
      'Prepare renewal recommendation for human approval.',
    ],
    evidenceIds: health.evidenceIds,
    confidence: health.confidence,
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  };
}

export function assessExpansionOpportunity(
  context: TenantContext,
  health: CustomerHealthAssessment,
  usageScore = 0,
  outcomeScore = 0,
): ExpansionOpportunityAssessment {
  assertTenant(context, health.tenantId);

  const score = Math.round(
    clamp(
      health.score * 0.4 +
      clamp(usageScore) * 0.3 +
      clamp(outcomeScore) * 0.3,
    ),
  );

  const eligible =
    health.status === 'HEALTHY' &&
    health.churnRisk === 'LOW' &&
    score >= 70;

  return {
    id:
      `expansion:${health.tenantId}:${health.customerId}:${health.id}`,
    tenantId: health.tenantId,
    customerId: health.customerId,
    ...(health.accountId !== undefined ? { accountId: health.accountId } : {}),
    healthAssessmentId: health.id,
    eligible,
    score,
    rationale: eligible
      ? [
          'Customer health is strong.',
          'Churn risk is low.',
          'Usage and outcomes support expansion review.',
        ]
      : [
          'Expansion is blocked until customer health and outcomes meet thresholds.',
        ],
    recommendedActions: eligible
      ? [
          'Create an expansion opportunity for governed sales review.',
          'Validate unmet need and product fit before proposal.',
        ]
      : [
          'Prioritize retention and customer outcomes before upsell.',
        ],
    evidenceIds: health.evidenceIds,
    confidence: health.confidence,
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  };
}
