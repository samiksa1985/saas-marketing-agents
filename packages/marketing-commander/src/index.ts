import type {
  CanonicalAgentTier,
  CanonicalAgentRecord,
} from '@platform/contracts';

export type MarketingObjective =
  | 'understand_business'
  | 'define_strategy'
  | 'build_demand'
  | 'generate_leads'
  | 'accelerate_pipeline'
  | 'launch_campaign'
  | 'improve_conversion'
  | 'optimize_marketing'
  | 'retain_customers'
  | 'improve_profitability'
  | 'general_growth';

export type ApprovalRequirement = 'NONE' | 'INTERNAL' | 'CLIENT' | 'OWNER';

export interface MarketingCommanderInput {
  tenantId: string;
  userId?: string;
  goal: string;
  objective?: MarketingObjective;
  constraints?: string[];
  targetAudience?: string[];
  channels?: string[];
  budget?: number;
  currency?: string;
  timeframe?: string;
  locale?: string;
  contextSummary?: string;
}

export interface CommanderSelection {
  id: string;
  reason: string;
  priority: number;
  approval: ApprovalRequirement;
}

export interface MarketingCommanderPlan {
  planId: string;
  tenantId: string;
  goal: string;
  objective: MarketingObjective;
  assumptions: string[];
  needsInput: string[];
  domainLeaders: CommanderSelection[];
  capabilities: CommanderSelection[];
  workstreams: CommanderSelection[];
  specialistAgentIds: string[];
  sequence: Array<{
    step: number;
    action: string;
    owner: string;
    dependsOn: number[];
    approval: ApprovalRequirement;
  }>;
  governance: {
    requiresHumanApproval: boolean;
    approvalReasons: string[];
    externalExecutionBlockedUntilApproval: boolean;
  };
}

const WORKSTREAM_ROUTING: Record<string, Array<{id:string; reason:string; priority:number}>> = {
  understand_business: [
    {id:'01', reason:'Establish ICP/account/customer context before downstream execution.', priority:1},
    {id:'03', reason:'Establish competitive context before positioning.', priority:2},
  ],
  define_strategy: [
    {id:'01', reason:'Define target audience/account strategy.', priority:1},
    {id:'02', reason:'Translate business and market intelligence into positioning strategy.', priority:2},
    {id:'04', reason:'Create approved messaging direction.', priority:3},
  ],
  build_demand: [
    {id:'05', reason:'Create the commercial content system needed for demand creation.', priority:2},
    {id:'06', reason:'Capture search/AEO demand and discoverability.', priority:3},
    {id:'07', reason:'Activate social distribution where relevant.', priority:4},
  ],
  generate_leads: [
    {id:'01', reason:'Select and prioritize target accounts or audiences.', priority:1},
    {id:'08', reason:'Translate target signals into governed outbound motion.', priority:2},
    {id:'09', reason:'Activate lifecycle/email follow-up where permitted.', priority:3},
    {id:'10', reason:'Prepare sales handoff and enablement.', priority:4},
  ],
  accelerate_pipeline: [
    {id:'01', reason:'Prioritize accounts and buying context.', priority:1},
    {id:'08', reason:'Activate trigger-based acquisition motion.', priority:2},
    {id:'09', reason:'Nurture and follow up.', priority:3},
    {id:'10', reason:'Improve sales enablement and handoff.', priority:4},
    {id:'11', reason:'Measure pipeline outcomes and diagnose bottlenecks.', priority:5},
  ],
  launch_campaign: [
    {id:'02', reason:'Anchor campaign to approved strategy and positioning.', priority:1},
    {id:'04', reason:'Define message system.', priority:2},
    {id:'05', reason:'Prepare campaign content assets.', priority:3},
    {id:'12', reason:'Coordinate campaign execution as a governed workflow.', priority:4},
    {id:'13', reason:'Apply quality/compliance gates before release.', priority:5},
  ],
  improve_conversion: [
    {id:'04', reason:'Review message clarity and value narrative.', priority:1},
    {id:'05', reason:'Review content and conversion assets.', priority:2},
    {id:'11', reason:'Diagnose funnel performance and evidence.', priority:3},
  ],
  optimize_marketing: [
    {id:'11', reason:'Establish performance baseline and identify causes.', priority:1},
    {id:'12', reason:'Coordinate optimization changes through workflow.', priority:2},
    {id:'13', reason:'Validate changes and guardrails.', priority:3},
  ],
  retain_customers: [
    {id:'10', reason:'Use sales/customer-success enablement for lifecycle decisions.', priority:2},
    {id:'11', reason:'Measure retention and expansion signals.', priority:3},
    {id:'12', reason:'Coordinate lifecycle actions.', priority:4},
  ],
  improve_profitability: [
    {id:'11', reason:'Measure channel and funnel economics.', priority:1},
    {id:'12', reason:'Coordinate optimization changes.', priority:2},
  ],
  general_growth: [
    {id:'01', reason:'Start with audience/account intelligence.', priority:1},
    {id:'02', reason:'Build strategic direction.', priority:2},
    {id:'04', reason:'Create messaging foundation.', priority:3},
    {id:'05', reason:'Prepare demand assets.', priority:4},
    {id:'11', reason:'Measure outcomes.', priority:5},
  ],
};

const KEYWORD_OBJECTIVE_RULES: Array<{words:string[]; objective:MarketingObjective}> = [
  {words:['lead','leads','prospect','prospecting','pipeline','meetings','customers'], objective:'generate_leads'},
  {words:['campaign','launch','promotion'], objective:'launch_campaign'},
  {words:['strategy','positioning','gtm','go-to-market'], objective:'define_strategy'},
  {words:['seo','search','geo','aeo','content'], objective:'build_demand'},
  {words:['conversion','cro','landing','funnel'], objective:'improve_conversion'},
  {words:['optimize','optimization','performance','roi','cac'], objective:'optimize_marketing'},
  {words:['retain','retention','renewal','churn','expansion'], objective:'retain_customers'},
  {words:['profit','margin','cost','profitability'], objective:'improve_profitability'},
];

export function inferObjective(input: MarketingCommanderInput): MarketingObjective {
  if (input.objective) return input.objective;
  const text = input.goal.toLowerCase();
  for (const rule of KEYWORD_OBJECTIVE_RULES) {
    if (rule.words.some((word) => text.includes(word))) return rule.objective;
  }
  return 'general_growth';
}

export function buildMarketingCommanderPlan(
  input: MarketingCommanderInput,
  registry: {
    domainLeaders: CanonicalAgentRecord[];
    specialists: Array<{id:string; name:string; tier?:CanonicalAgentTier}>;
  },
): MarketingCommanderPlan {
  const objective = inferObjective(input);
  const objectiveWorkstreams = WORKSTREAM_ROUTING[objective] ?? WORKSTREAM_ROUTING.general_growth;

  const leaderById = new Map(registry.domainLeaders.map((agent) => [agent.id, agent]));

  const leaderIds = new Set<string>(['business-intelligence']);
  if (['define_strategy','general_growth'].includes(objective)) leaderIds.add('marketing-strategist');
  if (['build_demand','launch_campaign','improve_conversion'].includes(objective)) {
    leaderIds.add('content');
    leaderIds.add('campaign');
  }
  if (['generate_leads','accelerate_pipeline'].includes(objective)) {
    leaderIds.add('sales');
    leaderIds.add('business-intelligence');
    leaderIds.add('market-research');
  }
  if (['optimize_marketing','improve_conversion'].includes(objective)) leaderIds.add('analytics');
  if (objective === 'retain_customers') leaderIds.add('customer-success');
  if (objective === 'improve_profitability') leaderIds.add('cfo-intelligence');
  if (['launch_campaign','build_demand'].includes(objective)) leaderIds.add('seo');

  const domainLeaders: CommanderSelection[] = [...leaderIds]
    .map((id) => {
      const agent = leaderById.get(id);
      return agent
        ? {id, reason: `Selected for ${objective}.`, priority: 1, approval: 'NONE' as const}
        : null;
    })
    .filter((x): x is CommanderSelection => Boolean(x));

  const capabilities: CommanderSelection[] = [];
  for (const leader of domainLeaders) {
    const record = leaderById.get(leader.id);
    for (const capabilityId of record?.agentDefinition?.agentId ? [] : []) {
      void capabilityId;
    }
  }

  const needsInput: string[] = [];
  if (!input.contextSummary) needsInput.push('[NEEDS INPUT: business context or approved company profile]');
  if (!input.timeframe) needsInput.push('[NEEDS INPUT: desired timeframe]');
  if (['generate_leads','accelerate_pipeline'].includes(objective) && !input.targetAudience?.length) {
    needsInput.push('[NEEDS INPUT: target audience / ICP or account universe]');
  }

  const specialistAgentIds = registry.specialists
    .filter((agent) => {
      const haystack = `${agent.id} ${agent.name}`.toLowerCase();
      if (['generate_leads','accelerate_pipeline'].includes(objective)) {
        return /sales|outbound|abm|growth|analytics/.test(haystack);
      }
      if (objective === 'build_demand') return /content|seo|social|email|growth/.test(haystack);
      if (objective === 'launch_campaign') return /campaign|content|paid|social|email|design|analytics/.test(haystack);
      if (objective === 'improve_conversion') return /growth|analytics|content|design|seo/.test(haystack);
      if (objective === 'optimize_marketing') return /analytics|growth|paid|seo|content/.test(haystack);
      if (objective === 'retain_customers') return /client|customer|email|growth|analytics/.test(haystack);
      return /strategy|marketing|analytics|growth|product-marketing/.test(haystack);
    })
    .slice(0, 12)
    .map((agent) => agent.id);

  const sequence: MarketingCommanderPlan['sequence'] = [];
  let step = 1;
  sequence.push({step:step++, action:'Load and validate company/context evidence.', owner:'business-intelligence', dependsOn:[], approval:'NONE'});
  if (objectiveWorkstreams.some((item) => item.id === '01' || item.id === '03')) {
    sequence.push({step:step++, action:'Establish audience/account and market intelligence.', owner:'business-intelligence', dependsOn:[1], approval:'NONE'});
  }
  if (objectiveWorkstreams.some((item) => ['02','04'].includes(item.id))) {
    sequence.push({step:step++, action:'Build or validate strategy, positioning, and messaging.', owner:'marketing-strategist', dependsOn:[1], approval:'NONE'});
  }
  sequence.push({step:step++, action:'Prepare execution plan and governed specialist tasks.', owner:'ai-orchestrator', dependsOn:[1], approval:'NONE'});
  sequence.push({step:step++, action:'Create an approval-gated execution package for external actions.', owner:'automation', dependsOn:[step-1], approval:'CLIENT'});

  const requiresApproval = sequence.some((item) => item.approval !== 'NONE');
  const assumptions = [
    'Existing registry and workstream contracts remain authoritative.',
    'Specialists execute through approved tools/workflows rather than bypassing orchestration.',
    'External side effects remain approval/policy controlled until execution permissions are explicitly granted.',
  ];

  return {
    planId: `mcp-${Date.now()}`,
    tenantId: input.tenantId,
    goal: input.goal,
    objective,
    assumptions,
    needsInput,
    domainLeaders,
    capabilities,
    workstreams: objectiveWorkstreams.map((w) => ({
      id:w.id, reason:w.reason, priority:w.priority, approval: w.id === '13' ? 'INTERNAL' : 'NONE'
    })),
    specialistAgentIds,
    sequence,
    governance: {
      requiresHumanApproval: requiresApproval,
      approvalReasons: ['External execution must remain governed until tool permissions are granted.'],
      externalExecutionBlockedUntilApproval: true,
    },
  };
}
