import type {
  CampaignExecutionInput,
  CampaignExecutionPlan,
  ContentDraft,
  ContentOptimizationInput,
  ContentOptimizationResult,
  ContentProductionInput,
  ContentProductionResult,
  CreativeConcept,
  CreativeConceptInput,
  CreativeExecutionResult,
  CreativeVariant,
  MarketingAgentPolicy,
  MarketingEvidenceReference,
  MarketingExecutionHandoff,
  MarketingQualityFlag,
  SEOExecutionInput,
  SEOExecutionResult,
  SEOKeywordCluster,
} from '@platform/contracts';


export class MarketingExecutionError
  extends Error {}


function requireText(
  value: string,
  field: string,
): void {
  if (!value.trim()) {
    throw new MarketingExecutionError(
      `${field} is required`,
    );
  }
}


function assertTenant(
  tenantId: string,
): void {
  requireText(
    tenantId,
    'tenantId',
  );
}


function clampConfidence(
  value: number,
): number {
  return Math.max(
    0,
    Math.min(
      1,
      value,
    ),
  );
}


function evidenceConfidence(
  evidence:
    MarketingEvidenceReference[],
): number {
  if (
    evidence.length === 0
  ) {
    return 0.55;
  }

  if (
    evidence.length >= 4
  ) {
    return 0.9;
  }

  return clampConfidence(
    0.6 +
      evidence.length *
        0.08,
  );
}


function baseQA(
  evidence:
    MarketingEvidenceReference[],
): MarketingQualityFlag[] {
  const flags:
    MarketingQualityFlag[] =
      [];

  if (
    evidence.length === 0
  ) {
    flags.push({
      code:
        'NO_EVIDENCE',
      severity:
        'WARNING',
      message:
        'No supporting evidence records were supplied.',
    });
  }

  return flags;
}


/* ==========================================================
 * AGENT / TOOL POLICIES
 * ========================================================== */

export const MARKETING_AGENT_POLICIES:
  readonly MarketingAgentPolicy[] =
[
  {
    domain:
      'CAMPAIGN',

    allowedTools: [
      'analytics_reader',
      'content_library',
      'CRM',
    ],

    mayPublishExternally:
      false,

    requiresHumanApprovalForExternalAction:
      true,
  },

  {
    domain:
      'CONTENT',

    allowedTools: [
      'knowledge_base',
      'content_library',
    ],

    mayPublishExternally:
      false,

    requiresHumanApprovalForExternalAction:
      true,
  },

  {
    domain:
      'CREATIVE',

    allowedTools: [
      'brand_assets',
      'image_generation_if_enabled',
      'content_library',
    ],

    mayPublishExternally:
      false,

    requiresHumanApprovalForExternalAction:
      true,
  },

  {
    domain:
      'SEO',

    allowedTools: [
      'web_search',
      'keyword_research',
      'website_reader',
      'analytics_reader',
    ],

    mayPublishExternally:
      false,

    requiresHumanApprovalForExternalAction:
      true,
  },
] as const;


export function policyForDomain(
  domain:
    MarketingAgentPolicy['domain'],
): MarketingAgentPolicy {
  const policy =
    MARKETING_AGENT_POLICIES.find(
      (item) =>
        item.domain === domain,
    );

  if (!policy) {
    throw new MarketingExecutionError(
      `No marketing policy for domain ${domain}`,
    );
  }

  return policy;
}


/* ==========================================================
 * CAMPAIGN
 * ========================================================== */

export function buildCampaignExecutionPlan(
  input:
    CampaignExecutionInput,
): CampaignExecutionPlan {
  assertTenant(
    input.tenantId,
  );

  requireText(
    input.goal,
    'goal',
  );

  if (
    input.audience.length === 0
  ) {
    throw new MarketingExecutionError(
      'Campaign audience is required',
    );
  }

  if (
    input.channels.length === 0
  ) {
    throw new MarketingExecutionError(
      'At least one campaign channel is required',
    );
  }

  if (
    input.budget &&
    input.budget.amount < 0
  ) {
    throw new MarketingExecutionError(
      'Campaign budget cannot be negative',
    );
  }

  const evidence =
    input.evidence ?? [];

  const messaging =
    input.audience.map(
      (audience) =>
        `${input.goal} for ${audience}`,
    );

  const assets =
    input.channels.map(
      (channel) => ({
        assetType:
          'channel-content',

        channel,

        purpose:
          input.goal,
      }),
    );

  const kpis =
    input.funnelStages.map(
      (stage) => ({
        name:
          `${stage.toLowerCase()}_conversion_rate`,

        unit:
          'percent',
      }),
    );

  return {
    tenantId:
      input.tenantId,

    locale:
      input.locale,

    domain:
      'CAMPAIGN',

    status:
      'READY_FOR_REVIEW',

    confidence:
      evidenceConfidence(
        evidence,
      ),

    evidence,

    assumptions:
      input.offer
        ? []
        : [
            {
              id:
                'campaign-offer-missing',
              statement:
                'Campaign offer is not yet defined.',
              material:
                true,
            },
          ],

    qaFlags:
      baseQA(
        evidence,
      ),

    requiresApproval:
      true,

    goal:
      input.goal,

    audience:
      [...input.audience],

    ...(input.offer
      ? {
          offer:
            input.offer,
        }
      : {}),

    messaging,

    assets,

    funnelStages:
      [...input.funnelStages],

    ...(input.budget
      ? {
          budget: {
            ...input.budget,
          },
        }
      : {}),

    kpis,

    launchChecklist: [
      'Validate audience and offer.',
      'Validate campaign assets.',
      'Confirm measurement configuration.',
      'Confirm privacy and compliance requirements.',
      'Obtain human approval before external launch.',
    ],
  };
}


/* ==========================================================
 * CONTENT
 * ========================================================== */

export function validateContentProductionInput(
  input:
    ContentProductionInput,
): void {
  assertTenant(
    input.tenantId,
  );

  requireText(
    input.brief,
    'brief',
  );

  requireText(
    input.objective,
    'objective',
  );

  if (
    input.audience.length === 0
  ) {
    throw new MarketingExecutionError(
      'Content audience is required',
    );
  }
}


export function buildContentProductionResult(
  input:
    ContentProductionInput,

  drafts:
    ContentDraft[],
): ContentProductionResult {
  validateContentProductionInput(
    input,
  );

  if (
    drafts.length === 0
  ) {
    throw new MarketingExecutionError(
      'At least one content draft is required',
    );
  }

  const evidence =
    input.evidence ?? [];

  const qaFlags =
    baseQA(
      evidence,
    );

  for (
    const prohibited
    of input.prohibitedClaims ??
      []
  ) {
    const found =
      drafts.some(
        (draft) =>
          [
            draft.concept,
            draft.hook,
            draft.body,
            draft.cta,
          ].some(
            (value) =>
              value
                .toLowerCase()
                .includes(
                  prohibited
                    .toLowerCase(),
                ),
          ),
      );

    if (found) {
      qaFlags.push({
        code:
          'PROHIBITED_CLAIM',

        severity:
          'BLOCKING',

        message:
          `Draft contains prohibited claim: ${prohibited}`,
      });
    }
  }

  return {
    tenantId:
      input.tenantId,

    locale:
      input.locale,

    domain:
      'CONTENT',

    status:
      qaFlags.some(
        (flag) =>
          flag.severity ===
          'BLOCKING',
      )
        ? 'DRAFT'
        : 'READY_FOR_REVIEW',

    confidence:
      evidenceConfidence(
        evidence,
      ),

    evidence,

    assumptions: [],

    qaFlags,

    requiresApproval:
      true,

    concepts:
      Array.from(
        new Set(
          drafts.map(
            (draft) =>
              draft.concept,
          ),
        ),
      ),

    hooks:
      drafts.map(
        (draft) =>
          draft.hook,
      ),

    drafts,

    sources:
      evidence,
  };
}


export function optimizeContentDraft(
  input:
    ContentOptimizationInput,

  optimized:
    ContentDraft,

  changes:
    string[],
): ContentOptimizationResult {
  assertTenant(
    input.tenantId,
  );

  if (
    optimized.id ===
    input.draft.id
  ) {
    throw new MarketingExecutionError(
      'Optimized draft must have a new artifact id',
    );
  }

  const evidence =
    input.evidence ?? [];

  const qaFlags =
    baseQA(
      evidence,
    );

  return {
    tenantId:
      input.tenantId,

    locale:
      input.locale,

    domain:
      'CONTENT',

    status:
      'READY_FOR_REVIEW',

    confidence:
      evidenceConfidence(
        evidence,
      ),

    evidence,

    assumptions: [],

    qaFlags,

    requiresApproval:
      true,

    originalDraftId:
      input.draft.id,

    optimizedDraft:
      optimized,

    changes:
      [...changes],
  };
}


/* ==========================================================
 * CREATIVE
 * ========================================================== */

export function buildCreativeExecutionResult(
  input:
    CreativeConceptInput,

  concepts:
    CreativeConcept[],

  variants:
    CreativeVariant[],
): CreativeExecutionResult {
  assertTenant(
    input.tenantId,
  );

  requireText(
    input.objective,
    'objective',
  );

  if (
    input.audience.length === 0
  ) {
    throw new MarketingExecutionError(
      'Creative audience is required',
    );
  }

  if (
    concepts.length === 0
  ) {
    throw new MarketingExecutionError(
      'At least one creative concept is required',
    );
  }

  const conceptIds =
    new Set(
      concepts.map(
        (concept) =>
          concept.id,
      ),
    );

  for (
    const variant
    of variants
  ) {
    if (
      !conceptIds.has(
        variant.conceptId,
      )
    ) {
      throw new MarketingExecutionError(
        `Creative variant references unknown concept ${variant.conceptId}`,
      );
    }
  }

  const evidence =
    input.evidence ?? [];

  return {
    tenantId:
      input.tenantId,

    locale:
      input.locale,

    domain:
      'CREATIVE',

    status:
      'READY_FOR_REVIEW',

    confidence:
      evidenceConfidence(
        evidence,
      ),

    evidence,

    assumptions: [],

    qaFlags:
      baseQA(
        evidence,
      ),

    requiresApproval:
      true,

    concepts,

    variants,

    abTestPlan: {
      primaryMetric:
        'conversion_rate',

      hypothesis:
        `One creative direction will outperform alternatives for ${input.objective}.`,

      minimumVariants:
        Math.max(
          2,
          variants.length,
        ),
    },
  };
}


/* ==========================================================
 * SEO
 * ========================================================== */

export function buildSEOExecutionResult(
  input:
    SEOExecutionInput,

  keywordClusters:
    SEOKeywordCluster[],

  contentBriefs:
    SEOExecutionResult['contentBriefs'],

  onPageActions:
    string[],

  technicalRecommendations:
    string[],
): SEOExecutionResult {
  assertTenant(
    input.tenantId,
  );

  requireText(
    input.targetMarket,
    'targetMarket',
  );

  if (
    input.products.length === 0
  ) {
    throw new MarketingExecutionError(
      'SEO requires at least one product or service',
    );
  }

  const clusterIds =
    new Set(
      keywordClusters.map(
        (cluster) =>
          cluster.id,
      ),
    );

  for (
    const brief
    of contentBriefs
  ) {
    if (
      !clusterIds.has(
        brief.keywordClusterId,
      )
    ) {
      throw new MarketingExecutionError(
        `SEO brief references unknown keyword cluster ${brief.keywordClusterId}`,
      );
    }
  }

  const evidence =
    input.evidence ?? [];

  const qaFlags =
    baseQA(
      evidence,
    );

  if (
    keywordClusters.length === 0
  ) {
    qaFlags.push({
      code:
        'NO_KEYWORD_EVIDENCE',

      severity:
        'BLOCKING',

      message:
        'No keyword clusters were supplied from research.',
    });
  }

  return {
    tenantId:
      input.tenantId,

    locale:
      input.locale,

    domain:
      'SEO',

    status:
      qaFlags.some(
        (flag) =>
          flag.severity ===
          'BLOCKING',
      )
        ? 'DRAFT'
        : 'READY_FOR_REVIEW',

    confidence:
      evidenceConfidence(
        evidence,
      ),

    evidence,

    assumptions: [],

    qaFlags,

    requiresApproval:
      true,

    keywordClusters,

    contentBriefs,

    onPageActions:
      [...onPageActions],

    technicalRecommendations:
      [
        ...technicalRecommendations,
      ],

    kpis: [
      {
        name:
          'organic_qualified_traffic',
      },
      {
        name:
          'organic_conversion_rate',
        unit:
          'percent',
      },
      {
        name:
          'priority_keyword_visibility',
        unit:
          'percent',
      },
    ],
  };
}


/* ==========================================================
 * HANDOFF
 * ========================================================== */

export function createMarketingHandoff(
  handoff:
    MarketingExecutionHandoff,
): MarketingExecutionHandoff {
  assertTenant(
    handoff.tenantId,
  );

  if (
    handoff.fromDomain ===
    handoff.toDomain
  ) {
    throw new MarketingExecutionError(
      'Marketing handoff requires different source and destination domains',
    );
  }

  requireText(
    handoff.reason,
    'handoff.reason',
  );

  return {
    ...handoff,

    artifactIds:
      [...handoff.artifactIds],

    requiredInputs:
      [...handoff.requiredInputs],
  };
}


export * from './integration.js';
