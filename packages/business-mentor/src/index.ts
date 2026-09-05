import type {
  BusinessMentorInput,
  BusinessMentorResult,
  MentorDecisionContext,
  MentorDecisionOption,
  MentorDecisionRecommendation,
  MentorDecisionSupportInput,
  MentorDecisionSupportResult,
  MentorEvidence,
  MentorHandoffRequest,
  MentorPriority,
  MentorPriorityItem,
  MentorRisk,
} from '@platform/contracts';


export class BusinessMentorError extends Error {}


function requireTenant(
  tenantId: string,
): void {
  if (!tenantId.trim()) {
    throw new BusinessMentorError(
      'tenantId is required',
    );
  }
}


function clamp(
  value: number,
): number {
  return Math.max(
    0,
    Math.min(1, value),
  );
}


function uniqueEvidenceIds(
  evidence: MentorEvidence[],
): string[] {
  return Array.from(
    new Set(
      evidence
        .map((item) => item.id)
        .filter(Boolean),
    ),
  );
}


function confidenceFromEvidence(
  evidence: MentorEvidence[],
): number {
  if (evidence.length === 0) {
    return 0.35;
  }

  if (evidence.length >= 8) {
    return 0.9;
  }

  return clamp(
    0.5 +
      evidence.length * 0.05,
  );
}


function numericEvidence(
  evidence: MentorEvidence[],
  pattern: RegExp,
): MentorEvidence[] {
  return evidence.filter(
    (item) =>
      pattern.test(
        item.label.toLowerCase(),
      ) &&
      typeof item.value ===
        'number',
  );
}


function priorityFromSignal(
  value: number,
  inverse = false,
): MentorPriority {
  const normalized =
    inverse
      ? 100 - value
      : value;

  if (normalized >= 80) {
    return 'CRITICAL';
  }

  if (normalized >= 60) {
    return 'HIGH';
  }

  if (normalized >= 40) {
    return 'MEDIUM';
  }

  return 'LOW';
}


function optionAssessment(
  option: string,
): MentorDecisionOption {
  return {
    option,

    advantages: [
      `Potential upside of ${option} should be validated against business goals.`,
    ],

    disadvantages: [
      `Trade-offs of ${option} require evidence before commitment.`,
    ],

    risks: [
      `Execution risk for ${option} must be assessed before approval.`,
    ],
  };
}


export function assessDecisionSupport(
  input:
    MentorDecisionSupportInput,
): MentorDecisionSupportResult {
  requireTenant(
    input.tenantId,
  );

  if (
    !input.decision.question.trim()
  ) {
    throw new BusinessMentorError(
      'Decision question is required',
    );
  }

  if (
    input.decision.options.length <
    2
  ) {
    throw new BusinessMentorError(
      'Decision support requires at least two options',
    );
  }

  const evidenceIds =
    uniqueEvidenceIds(
      input.evidence,
    );

  const missingFields:
    string[] = [];

  if (
    evidenceIds.length === 0
  ) {
    missingFields.push(
      'decision_evidence',
    );
  }

  const options =
    input.decision.options.map(
      optionAssessment,
    );

  /*
   * No option is automatically selected when evidence
   * does not establish a deterministic winner.
   *
   * This prevents the Mentor from fabricating a business
   * conclusion or silently becoming an executive authority.
   */
  const recommendation:
    MentorDecisionRecommendation =
  {
    decisionId:
      input.decision.id,

    question:
      input.decision.question,

    options,

    rationale:
      evidenceIds.length > 0
        ? 'Decision options were framed using the supplied business evidence. Final selection remains a human decision.'
        : 'Insufficient evidence exists to recommend a specific option.',

    expectedImpact:
      'Expected impact must be validated against approved business goals and measurable outcomes.',

    evidenceIds,

    confidence:
      confidenceFromEvidence(
        input.evidence,
      ),

    requiresHumanDecision:
      true,
  };

  const risks:
    MentorRisk[] = [
      {
        type:
          'STRATEGIC',

        description:
          'A decision made without sufficient evidence may create strategic or commercial risk.',

        severity:
          evidenceIds.length === 0
            ? 'HIGH'
            : 'MEDIUM',

        evidenceIds,
      },
    ];

  return {
    tenantId:
      input.tenantId,

    decision:
      recommendation,

    risks,

    missingFields,

    confidence:
      recommendation.confidence,

    advisoryOnly:
      true,

    requiresHumanDecision:
      true,
  };
}


function buildPriorities(
  input: BusinessMentorInput,
): MentorPriorityItem[] {
  const evidence = [
    ...input.businessMetrics,
    ...input.pipeline,
    ...input.clients,
    ...input.profitability,
  ];

  const result:
    MentorPriorityItem[] = [];

  const pipelineSignals =
    numericEvidence(
      input.pipeline,
      /coverage|pipeline|gap/,
    );

  for (
    const signal of pipelineSignals
  ) {
    const value =
      signal.value as number;

    result.push({
      id:
        `priority-${signal.id}`,

      priority:
        priorityFromSignal(
          value,
          /coverage/.test(
            signal.label.toLowerCase(),
          ),
        ),

      title:
        `Review ${signal.label}`,

      rationale:
        `Current evidence reports ${signal.label} at ${value}.`,

      expectedImpact:
        'Improved commercial focus and pipeline quality.',

      evidenceIds: [
        signal.id,
      ],

      confidence:
        0.9,
    });
  }

  const profitabilitySignals =
    numericEvidence(
      input.profitability,
      /margin|profit|loss|cost/,
    );

  for (
    const signal
    of profitabilitySignals
  ) {
    result.push({
      id:
        `priority-${signal.id}`,

      priority:
        'HIGH',

      title:
        `Review profitability signal: ${signal.label}`,

      rationale:
        `Profitability evidence requires management attention: ${signal.value}.`,

      expectedImpact:
        'Protect contribution margin and improve economic quality of growth.',

      evidenceIds: [
        signal.id,
      ],

      confidence:
        0.9,
    });
  }

  if (
    result.length === 0 &&
    evidence.length > 0
  ) {
    result.push({
      id:
        'priority-review-business-performance',

      priority:
        'MEDIUM',

      title:
        'Review current business performance',

      rationale:
        'Business evidence exists but no deterministic critical threshold was detected.',

      expectedImpact:
        'Maintain alignment between goals, commercial execution and profitability.',

      evidenceIds:
        uniqueEvidenceIds(
          evidence,
        ),

      confidence:
        confidenceFromEvidence(
          evidence,
        ),
    });
  }

  return result.slice(0, 5);
}


function determineMissingFields(
  input: BusinessMentorInput,
): string[] {
  const missing:
    string[] = [];

  if (
    input.businessMetrics.length ===
    0
  ) {
    missing.push(
      'business_metrics',
    );
  }

  if (
    input.pipeline.length === 0
  ) {
    missing.push(
      'pipeline',
    );
  }

  if (
    input.clients.length === 0
  ) {
    missing.push(
      'clients',
    );
  }

  if (
    input.profitability.length ===
    0
  ) {
    missing.push(
      'profitability',
    );
  }

  if (
    input.goals.length === 0
  ) {
    missing.push(
      'goals',
    );
  }

  return missing;
}


export function buildBusinessMentorResult(
  input:
    BusinessMentorInput,
): BusinessMentorResult {
  requireTenant(
    input.tenantId,
  );

  const allEvidence = [
    ...input.businessMetrics,
    ...input.pipeline,
    ...input.clients,
    ...input.profitability,
  ];

  const missingFields =
    determineMissingFields(
      input,
    );

  const priorities =
    buildPriorities(
      input,
    );

  const decisions:
    MentorDecisionRecommendation[] =
      [];

  const risks:
    MentorRisk[] = [];

  for (
    const decision
    of input.decisions ?? []
  ) {
    const support =
      assessDecisionSupport({
        tenantId:
          input.tenantId,

        locale:
          input.locale,

        decision,

        evidence:
          allEvidence,
      });

    decisions.push(
      support.decision,
    );

    risks.push(
      ...support.risks,
    );
  }

  const handoffs:
    MentorHandoffRequest[] =
      [];

  if (
    input.profitability.length ===
    0
  ) {
    handoffs.push({
      targetCapability:
        'CAP-CFO-PROFITABILITY',

      reason:
        'Profitability evidence is required before financial recommendations can be strengthened.',

      requiredInputs: [
        'revenue',
        'direct_costs',
      ],

      evidenceIds: [],
    });
  }

  if (
    input.pipeline.length === 0
  ) {
    handoffs.push({
      targetCapability:
        'CAP-SALES-INTELLIGENCE',

      reason:
        'Pipeline evidence is required for commercial prioritization.',

      requiredInputs: [
        'pipeline',
      ],

      evidenceIds: [],
    });
  }

  const evidenceIds =
    uniqueEvidenceIds(
      allEvidence,
    );

  return {
    tenantId:
      input.tenantId,

    locale:
      input.locale,

    status:
      missingFields.length > 0
        ? 'NEEDS_MORE_CONTEXT'
        : 'READY',

    dailyPriorities:
      priorities,

    decisions,

    risks,

    learning: {
      businessLesson:
        priorities.length > 0
          ? 'Prioritize measurable business constraints before optimizing activity volume.'
          : 'Good business decisions require measurable evidence tied to explicit goals.',

      learningQuestion:
        'Which current constraint has the greatest measurable impact on revenue, margin, or customer retention?',
    },

    statements:
      evidenceIds.length > 0
        ? [
            {
              type:
                'FACT',

              text:
                'Recommendations are grounded in the supplied business evidence.',

              evidenceIds,
            },
          ]
        : [
            {
              type:
                'ASSUMPTION',

              text:
                'Business evidence is insufficient for material recommendations.',

              evidenceIds: [],
            },
          ],

    handoffs,

    missingFields,

    confidence:
      confidenceFromEvidence(
        allEvidence,
      ),

    advisoryOnly:
      true,

    mayExecuteSensitiveActions:
      false,
  };
}


export function assertMentorTenant(
  expectedTenantId: string,
  actualTenantId: string,
): void {
  requireTenant(
    actualTenantId,
  );

  if (
    expectedTenantId !==
    actualTenantId
  ) {
    throw new BusinessMentorError(
      'Cross-tenant mentor access denied',
    );
  }
}
