export type DomainAgentId =
  | 'ai-orchestrator'
  | 'business-intelligence'
  | 'market-research'
  | 'marketing-strategist'
  | 'content'
  | 'campaign'
  | 'creative'
  | 'seo'
  | 'analytics'
  | 'sales'
  | 'customer-success'
  | 'automation'
  | 'cfo-intelligence'
  | 'ai-business-mentor';

export interface DomainAgentDefinition {
  id: DomainAgentId;
  name: string;
  mission: string;
  defaultApproval: 'NONE' | 'INTERNAL' | 'CLIENT' | 'OWNER';
  handoffs: string[];
  capabilityIds: string[];
  source: 'ai-marketing-os-project';
}

export interface DomainCapabilityDefinition {
  id: string;
  name: string;
  ownerAgentId: DomainAgentId;
  type: 'CORE' | 'DOMAIN';
  mission: string;
  allowedTools: string[];
  approval: 'NONE' | 'INTERNAL' | 'CLIENT' | 'OWNER';
  risk: string;
  enabled: boolean;
}

export const AI_MARKETING_OS_DOMAIN_AGENTS: readonly DomainAgentDefinition[] = [
  {
    id: "ai-orchestrator",
    name: "AI Orchestrator",
    mission: "Coordinate agent selection, context loading, tool use, validation, approvals, and workflow state. Never invent business facts or bypass permissions.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-ORCH-ROUTING", "CAP-ORCH-COORDINATION"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "business-intelligence",
    name: "Business Intelligence Agent",
    mission: "Build and maintain the canonical company intelligence profile from approved company data and source documents.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-BI-COMPANY-INTELLIGENCE", "CAP-BI-CROSS-DOMAIN"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "market-research",
    name: "Market Research Agent",
    mission: "Research market conditions, competitors, demand signals, positioning gaps, and opportunities using approved external research tools.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-MKT-RESEARCH", "CAP-MKT-TREND-INTELLIGENCE"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "marketing-strategist",
    name: "Marketing Strategist Agent",
    mission: "Translate business and market intelligence into measurable 30/60/90-day marketing strategy.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-MKT-STRATEGY", "CAP-MKT-PRIORITIZATION"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "content",
    name: "Content Agent",
    mission: "Create channel-specific content aligned to approved strategy, brand voice, audience, funnel stage, and business objective.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-CONTENT-PRODUCTION", "CAP-CONTENT-OPTIMIZATION"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "campaign",
    name: "Campaign Agent",
    mission: "Design integrated campaigns that connect objective, audience, offer, creative, landing page, lead capture, follow-up, and measurement.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-CAMPAIGN-DESIGN", "CAP-CAMPAIGN-PLANNING"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "creative",
    name: "Creative Agent",
    mission: "Develop creative concepts and variants for ads and organic media, including visual direction and test plans.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-CREATIVE-CONCEPT", "CAP-CREATIVE-VARIANTS"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "seo",
    name: "SEO Agent",
    mission: "Identify search opportunities and produce SEO recommendations, briefs, on-page actions, and measurement plans.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-SEO-STRATEGY", "CAP-SEO-OPTIMIZATION"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "analytics",
    name: "Analytics & Growth Agent",
    mission: "Explain performance changes, identify causes, and recommend prioritized actions tied to business outcomes.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-ANALYTICS-PERFORMANCE", "CAP-ANALYTICS-EXPERIMENTS"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "sales",
    name: "Sales Agent",
    mission: "Support lead qualification, opportunity prioritization, discovery, proposals, follow-up, objection handling, and next-best actions.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-SALES-INTELLIGENCE", "CAP-SALES-PROPOSALS"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "customer-success",
    name: "Customer Success Agent",
    mission: "Protect retention, monitor client health, identify delivery risks, renewal risk, satisfaction issues, and expansion opportunities.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-CS-HEALTH", "CAP-CS-RENEWAL"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "automation",
    name: "Automation Agent",
    mission: "Design and validate business workflows with triggers, conditions, actions, retries, and human approval gates.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-AUTOMATION-WORKFLOWS", "CAP-AUTOMATION-EXECUTION"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "cfo-intelligence",
    name: "CFO Intelligence Agent",
    mission: "Analyze revenue, costs, AI/tool/human delivery costs, margins, unit economics, pricing, cash implications, and forecasts.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-CFO-PROFITABILITY", "CAP-CFO-FORECASTING"],
    source: 'ai-marketing-os-project',
  },
  {
    id: "ai-business-mentor",
    name: "AI Business Mentor",
    mission: "Coach the internal operator using real business data and explain decisions as practical business lessons.",
    defaultApproval: "CLIENT",
    handoffs: [],
    capabilityIds: ["CAP-MENTOR-ADVISORY", "CAP-MENTOR-DECISION-SUPPORT"],
    source: 'ai-marketing-os-project',
  }
] as const;

export const AI_MARKETING_OS_DOMAIN_CAPABILITIES: readonly DomainCapabilityDefinition[] = [
  {
    id: "CAP-ORCH-ROUTING",
    name: "Intent Routing",
    ownerAgentId: "ai-orchestrator",
    type: "CORE",
    mission: "Route requests to the appropriate owner and workflow.",
    allowedTools: ["agent_registry", "context_builder", "retriever", "workflow_engine", "approval_service"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-ORCH-COORDINATION",
    name: "Execution Coordination",
    ownerAgentId: "ai-orchestrator",
    type: "CORE",
    mission: "Coordinate context, tools, approvals, handoffs and workflow state.",
    allowedTools: ["agent_registry", "context_builder", "retriever", "workflow_engine", "approval_service"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-BI-COMPANY-INTELLIGENCE",
    name: "Company Intelligence",
    ownerAgentId: "business-intelligence",
    type: "DOMAIN",
    mission: "Maintain canonical company intelligence from approved data and sources.",
    allowedTools: ["knowledge_base", "document_search"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-BI-CROSS-DOMAIN",
    name: "Cross-domain Intelligence",
    ownerAgentId: "business-intelligence",
    type: "DOMAIN",
    mission: "Synthesize permitted business signals into a coherent business view.",
    allowedTools: ["knowledge_base", "document_search"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-MKT-RESEARCH",
    name: "Market Research",
    ownerAgentId: "market-research",
    type: "DOMAIN",
    mission: "Research market conditions, demand signals and opportunities.",
    allowedTools: ["web_search", "website_reader", "keyword_research"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-MKT-TREND-INTELLIGENCE",
    name: "Trend Intelligence",
    ownerAgentId: "market-research",
    type: "DOMAIN",
    mission: "Detect relevant market trends and changes with evidence.",
    allowedTools: ["web_search", "website_reader", "keyword_research"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-MKT-STRATEGY",
    name: "Marketing Strategy",
    ownerAgentId: "marketing-strategist",
    type: "DOMAIN",
    mission: "Translate business and market intelligence into measurable marketing strategy.",
    allowedTools: ["analytics_reader", "knowledge_base"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-MKT-PRIORITIZATION",
    name: "Marketing Prioritization",
    ownerAgentId: "marketing-strategist",
    type: "DOMAIN",
    mission: "Rank initiatives, channels and campaigns against goals, constraints and evidence.",
    allowedTools: ["analytics_reader", "knowledge_base"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CONTENT-PRODUCTION",
    name: "Content Production",
    ownerAgentId: "content",
    type: "DOMAIN",
    mission: "Create channel-specific marketing content aligned to approved strategy.",
    allowedTools: ["knowledge_base", "content_library"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CONTENT-OPTIMIZATION",
    name: "Content Optimization",
    ownerAgentId: "content",
    type: "DOMAIN",
    mission: "Improve drafts for audience, funnel stage, brand and measurable objectives.",
    allowedTools: ["knowledge_base", "content_library"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CAMPAIGN-DESIGN",
    name: "Campaign Design",
    ownerAgentId: "campaign",
    type: "DOMAIN",
    mission: "Design integrated campaigns connecting objectives, audience, offer and measurement.",
    allowedTools: ["analytics_reader", "content_library", "CRM"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CAMPAIGN-PLANNING",
    name: "Campaign Planning",
    ownerAgentId: "campaign",
    type: "DOMAIN",
    mission: "Convert strategy into executable campaign plans, assets, funnel and KPIs.",
    allowedTools: ["analytics_reader", "content_library", "CRM"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CREATIVE-CONCEPT",
    name: "Creative Concepts",
    ownerAgentId: "creative",
    type: "DOMAIN",
    mission: "Develop creative concepts, hooks and visual directions.",
    allowedTools: ["brand_assets", "image_generation_if_enabled", "content_library"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CREATIVE-VARIANTS",
    name: "Creative Variants",
    ownerAgentId: "creative",
    type: "DOMAIN",
    mission: "Generate structured creative variants and testing plans.",
    allowedTools: ["brand_assets", "image_generation_if_enabled", "content_library"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-SEO-STRATEGY",
    name: "SEO Strategy",
    ownerAgentId: "seo",
    type: "DOMAIN",
    mission: "Plan SEO initiatives aligned to business and marketing objectives.",
    allowedTools: ["web_search", "keyword_research", "website_reader", "analytics_reader"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-SEO-OPTIMIZATION",
    name: "SEO Optimization",
    ownerAgentId: "seo",
    type: "DOMAIN",
    mission: "Analyze and optimize search-oriented content and opportunities.",
    allowedTools: ["web_search", "keyword_research", "website_reader", "analytics_reader"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-ANALYTICS-PERFORMANCE",
    name: "Performance Analytics",
    ownerAgentId: "analytics",
    type: "DOMAIN",
    mission: "Measure campaign and business performance against defined KPIs.",
    allowedTools: ["analytics_reader", "CRM_reader", "finance_reader"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-ANALYTICS-EXPERIMENTS",
    name: "Experiment Analysis",
    ownerAgentId: "analytics",
    type: "DOMAIN",
    mission: "Evaluate tests and translate results into evidence-backed insights.",
    allowedTools: ["analytics_reader", "CRM_reader", "finance_reader"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-SALES-INTELLIGENCE",
    name: "Sales Intelligence",
    ownerAgentId: "sales",
    type: "DOMAIN",
    mission: "Analyze leads, opportunities, pipeline and next-best actions.",
    allowedTools: ["CRM", "proposal_generator", "knowledge_base"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-SALES-PROPOSALS",
    name: "Proposal Intelligence",
    ownerAgentId: "sales",
    type: "DOMAIN",
    mission: "Generate structured proposal recommendations from opportunity context.",
    allowedTools: ["CRM", "proposal_generator", "knowledge_base"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CS-HEALTH",
    name: "Customer Health",
    ownerAgentId: "customer-success",
    type: "DOMAIN",
    mission: "Assess customer health, retention and expansion signals.",
    allowedTools: ["CRM", "analytics_reader", "billing_reader", "tasks"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CS-RENEWAL",
    name: "Customer Retention",
    ownerAgentId: "customer-success",
    type: "DOMAIN",
    mission: "Identify renewal, upsell and churn-risk actions.",
    allowedTools: ["CRM", "analytics_reader", "billing_reader", "tasks"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-AUTOMATION-WORKFLOWS",
    name: "Workflow Automation",
    ownerAgentId: "automation",
    type: "DOMAIN",
    mission: "Define and coordinate approved automation workflows.",
    allowedTools: ["workflow_engine", "integrations_registry"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-AUTOMATION-EXECUTION",
    name: "Automation Execution",
    ownerAgentId: "automation",
    type: "DOMAIN",
    mission: "Execute workflow steps within policy, approval and tenant boundaries.",
    allowedTools: ["workflow_engine", "integrations_registry"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CFO-PROFITABILITY",
    name: "Profitability Intelligence",
    ownerAgentId: "cfo-intelligence",
    type: "DOMAIN",
    mission: "Analyze revenue, cost, margin and profitability signals.",
    allowedTools: ["finance_reader", "billing_reader", "analytics_reader"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-CFO-FORECASTING",
    name: "Financial Forecasting",
    ownerAgentId: "cfo-intelligence",
    type: "DOMAIN",
    mission: "Produce evidence-backed financial forecasts and scenarios.",
    allowedTools: ["finance_reader", "billing_reader", "analytics_reader"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-MENTOR-ADVISORY",
    name: "Business Advisory",
    ownerAgentId: "ai-business-mentor",
    type: "DOMAIN",
    mission: "Provide owner-level business guidance from permitted intelligence.",
    allowedTools: ["CRM", "finance_reader", "analytics_reader", "customer_success"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  },
  {
    id: "CAP-MENTOR-DECISION-SUPPORT",
    name: "Decision Support",
    ownerAgentId: "ai-business-mentor",
    type: "DOMAIN",
    mission: "Frame decisions, trade-offs and recommended next actions.",
    allowedTools: ["CRM", "finance_reader", "analytics_reader", "customer_success"],
    approval: "NONE",
    risk: "L1",
    enabled: true,
  }
] as const;

export function getDomainAgent(agentId: DomainAgentId): DomainAgentDefinition {
  const agent = AI_MARKETING_OS_DOMAIN_AGENTS.find((item) => item.id === agentId);
  if (!agent) {
    throw new Error(`Unknown AI Marketing OS domain agent: ${agentId}`);
  }
  return agent;
}

export function getDomainCapabilities(agentId: DomainAgentId): readonly DomainCapabilityDefinition[] {
  return AI_MARKETING_OS_DOMAIN_CAPABILITIES.filter((item) => item.ownerAgentId === agentId);
}

