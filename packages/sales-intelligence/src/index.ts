import type {
  LeadScoreAssessment,
  Opportunity,
  ProposalDraft,
  SalesForecast,
} from '@platform/contracts';
import { DEFAULT_OPPORTUNITY_STAGE_PROBABILITIES } from '@platform/contracts';

export interface LeadScoringInput {
  leadId?: string;
  companyName?: string | null;
  industry?: string | null;
  budget?: string | number | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  notes?: string | null;
  intent?: number;
  engagement?: number;
  timing?: number;
}

export interface ForecastInput {
  period: SalesForecast['period'];
  periodStart: string;
  periodEnd: string;
  opportunities: Opportunity[];
}

export interface ProposalDraftInput {
  id: string;
  tenantId: string;
  opportunity: Opportunity;
  customerName?: string;
  problemStatement?: string;
  proposedScope?: string[];
  assumptions?: string[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function containsBuyingIntent(notes?: string | null): boolean {
  if (!notes) return false;

  const normalized = notes.toLowerCase();

  return [
    'buy',
    'quote',
    'purchase',
    'proposal',
    'pricing',
    'شراء',
    'عرض سعر',
    'سعر',
  ].some((term) => normalized.includes(term));
}

/**
 * Canonical deterministic lead scoring.
 *
 * Ported from Project 2 sales intelligence logic while removing
 * Prisma and organization-specific runtime coupling.
 */
export function scoreLead(
  input: LeadScoringInput,
): LeadScoreAssessment {
  const fit = clampScore(
    45 +
      (input.industry ? 15 : 0) +
      (input.budget ? 20 : 0) +
      (input.companyName ? 10 : 0),
  );

  const intent = clampScore(
    input.intent ?? (containsBuyingIntent(input.notes) ? 85 : 55),
  );

  const engagement = clampScore(
    input.engagement ??
      40 +
        (input.email ? 20 : 0) +
        (input.phone ? 20 : 0) +
        (input.source ? 20 : 0),
  );

  const timing = clampScore(
    input.timing ?? (input.budget ? 80 : 55),
  );

  const score = clampScore(
    fit * 0.35 +
      intent * 0.30 +
      engagement * 0.20 +
      timing * 0.15,
  );

  const temperature: LeadScoreAssessment['temperature'] =
    score >= 80 ? 'HOT' : score >= 60 ? 'WARM' : 'COLD';

  const recommendations =
    temperature === 'HOT'
      ? [
          'Prioritize immediate sales follow-up.',
          'Prepare a tailored proposal or commercial next step.',
        ]
      : temperature === 'WARM'
        ? [
            'Continue qualification and nurture.',
            'Increase engagement before commercial escalation.',
          ]
        : [
            'Keep the lead in nurture.',
            'Collect stronger fit and intent signals before escalation.',
          ];

  return {
    ...(input.leadId ? { leadId: input.leadId } : {}),
    score,
    temperature,
    fit,
    intent,
    engagement,
    timing,
    factors: {
      fit,
      intent,
      engagement,
      timing,
    },
    recommendations,
    model: 'canonical-sales-score-v1',
  };
}

function opportunityProbability(opportunity: Opportunity): number {
  return DEFAULT_OPPORTUNITY_STAGE_PROBABILITIES[
    opportunity.stage
  ];
}

/**
 * Builds a deterministic pipeline forecast from canonical opportunities.
 * Persistence is deliberately kept outside this pure domain function.
 */
export function buildForecast(
  input: ForecastInput,
): SalesForecast {
  const opportunities = input.opportunities.filter((opportunity) => {
    if (!opportunity.expectedCloseAt) return true;

    const closeAt = new Date(opportunity.expectedCloseAt).getTime();
    const start = new Date(input.periodStart).getTime();
    const end = new Date(input.periodEnd).getTime();

    return closeAt >= start && closeAt <= end;
  });

  const pipelineAmount = opportunities.reduce(
    (sum, opportunity) => sum + (opportunity.amount ?? 0),
    0,
  );

  const weightedAmount = opportunities.reduce(
    (sum, opportunity) =>
      sum +
      (opportunity.amount ?? 0) *
        opportunityProbability(opportunity),
    0,
  );

  const winProbability =
    pipelineAmount > 0
      ? clampScore((weightedAmount / pipelineAmount) * 100)
      : 0;

  const confidence = clampScore(
    opportunities.length === 0
      ? 0
      : 50 +
          Math.min(opportunities.length * 5, 30) +
          (opportunities.every(
            (opportunity) => opportunity.expectedCloseAt,
          )
            ? 10
            : 0),
  );

  return {
    period: input.period,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    opportunityCount: opportunities.length,
    pipelineAmount,
    weightedAmount: Math.round(weightedAmount * 100) / 100,
    winProbability,
    confidence,
    opportunityIds: opportunities.map(
      (opportunity) => opportunity.id,
    ),
  };
}

/**
 * Produces a governed proposal artifact only.
 *
 * It does NOT send, publish, or externally execute the proposal.
 * The artifact must continue through the canonical approval/workflow layer.
 */
export function draftProposal(
  input: ProposalDraftInput,
): ProposalDraft {
  if (input.opportunity.tenantId !== input.tenantId) {
    throw new Error('Tenant mismatch while drafting proposal.');
  }

  const amount = input.opportunity.amount;

  return {
    id: input.id,
    tenantId: input.tenantId,
    opportunityId: input.opportunity.id,
    title: `Proposal — ${input.opportunity.name}`,
    ...(amount !== undefined ? { amount } : {}),
    ...(input.opportunity.currency
      ? { currency: input.opportunity.currency }
      : {}),
    status: 'DRAFT',
    content: {
      executiveSummary:
        `Commercial proposal for ${input.customerName ?? input.opportunity.name}.`,
      problem:
        input.problemStatement ??
        'Customer problem to be validated during the sales workflow.',
      valueProposition:
        'Recommended solution based on the qualified opportunity and available customer context.',
      scope: input.proposedScope ?? [],
      investment:
        amount !== undefined
          ? {
              amount,
              currency: input.opportunity.currency ?? null,
            }
          : null,
      assumptions: input.assumptions ?? [],
      nextStep:
        'Submit this draft to the canonical approval workflow before external use.',
    },
    requiresApproval: true,
  };
}
