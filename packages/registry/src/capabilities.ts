import type { CanonicalCapabilityRecord } from '@platform/contracts';

export const PROJECT2_CAPABILITIES: CanonicalCapabilityRecord[] =[
    {
        "id":  "CAP-ORCH-ROUTING",
        "name":  "Intent Routing",
        "ownerAgentId":  "ai-orchestrator",
        "type":  "CORE",
        "mission":  "Route requests to the appropriate owner and workflow.",
        "inputs":  [
                       "intent",
                       "organization_id",
                       "user_id",
                       "task_context"
                   ],
        "outputs":  [
                        "selected_agent",
                        "rationale",
                        "required_context",
                        "tool_plan",
                        "approval_required",
                        "workflow_actions"
                    ],
        "allowedTools":  [
                             "agent_registry",
                             "context_builder",
                             "retriever",
                             "workflow_engine",
                             "approval_service"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-ORCH-COORDINATION",
        "name":  "Execution Coordination",
        "ownerAgentId":  "ai-orchestrator",
        "type":  "CORE",
        "mission":  "Coordinate context, tools, approvals, handoffs and workflow state.",
        "inputs":  [
                       "intent",
                       "organization_id",
                       "user_id",
                       "task_context"
                   ],
        "outputs":  [
                        "selected_agent",
                        "rationale",
                        "required_context",
                        "tool_plan",
                        "approval_required",
                        "workflow_actions"
                    ],
        "allowedTools":  [
                             "agent_registry",
                             "context_builder",
                             "retriever",
                             "workflow_engine",
                             "approval_service"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-BI-COMPANY-INTELLIGENCE",
        "name":  "Company Intelligence",
        "ownerAgentId":  "business-intelligence",
        "type":  "DOMAIN",
        "mission":  "Maintain canonical company intelligence from approved data and sources.",
        "inputs":  [
                       "organization_id",
                       "company_profile",
                       "documents",
                       "onboarding_answers"
                   ],
        "outputs":  [
                        "company_summary",
                        "business_model",
                        "products",
                        "services",
                        "ICP",
                        "personas",
                        "positioning",
                        "strengths",
                        "weaknesses",
                        "opportunities",
                        "goals",
                        "confidence",
                        "sources"
                    ],
        "allowedTools":  [
                             "knowledge_base",
                             "document_search"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-BI-CROSS-DOMAIN",
        "name":  "Cross-domain Intelligence",
        "ownerAgentId":  "business-intelligence",
        "type":  "DOMAIN",
        "mission":  "Synthesize permitted business signals into a coherent business view.",
        "inputs":  [
                       "organization_id",
                       "company_profile",
                       "documents",
                       "onboarding_answers"
                   ],
        "outputs":  [
                        "company_summary",
                        "business_model",
                        "products",
                        "services",
                        "ICP",
                        "personas",
                        "positioning",
                        "strengths",
                        "weaknesses",
                        "opportunities",
                        "goals",
                        "confidence",
                        "sources"
                    ],
        "allowedTools":  [
                             "knowledge_base",
                             "document_search"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-MKT-RESEARCH",
        "name":  "Market Research",
        "ownerAgentId":  "market-research",
        "type":  "DOMAIN",
        "mission":  "Research market conditions, demand signals and opportunities.",
        "inputs":  [
                       "organization_id",
                       "research_question",
                       "company_context"
                   ],
        "outputs":  [
                        "market_summary",
                        "competitors",
                        "customer_signals",
                        "trends",
                        "opportunities",
                        "threats",
                        "evidence",
                        "confidence"
                    ],
        "allowedTools":  [
                             "web_search",
                             "website_reader",
                             "keyword_research"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-MKT-TREND-INTELLIGENCE",
        "name":  "Trend Intelligence",
        "ownerAgentId":  "market-research",
        "type":  "DOMAIN",
        "mission":  "Detect relevant market trends and changes with evidence.",
        "inputs":  [
                       "organization_id",
                       "research_question",
                       "company_context"
                   ],
        "outputs":  [
                        "market_summary",
                        "competitors",
                        "customer_signals",
                        "trends",
                        "opportunities",
                        "threats",
                        "evidence",
                        "confidence"
                    ],
        "allowedTools":  [
                             "web_search",
                             "website_reader",
                             "keyword_research"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-MKT-STRATEGY",
        "name":  "Marketing Strategy",
        "ownerAgentId":  "marketing-strategist",
        "type":  "DOMAIN",
        "mission":  "Translate business and market intelligence into measurable marketing strategy.",
        "inputs":  [
                       "company_context",
                       "market_research",
                       "goals",
                       "budget",
                       "historical_performance"
                   ],
        "outputs":  [
                        "objectives",
                        "ICP",
                        "positioning",
                        "messaging",
                        "channels",
                        "offers",
                        "campaigns",
                        "content_pillars",
                        "KPIs",
                        "roadmap",
                        "priorities",
                        "assumptions"
                    ],
        "allowedTools":  [
                             "analytics_reader",
                             "knowledge_base"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-MKT-PRIORITIZATION",
        "name":  "Marketing Prioritization",
        "ownerAgentId":  "marketing-strategist",
        "type":  "DOMAIN",
        "mission":  "Rank initiatives, channels and campaigns against goals, constraints and evidence.",
        "inputs":  [
                       "company_context",
                       "market_research",
                       "goals",
                       "budget",
                       "historical_performance"
                   ],
        "outputs":  [
                        "objectives",
                        "ICP",
                        "positioning",
                        "messaging",
                        "channels",
                        "offers",
                        "campaigns",
                        "content_pillars",
                        "KPIs",
                        "roadmap",
                        "priorities",
                        "assumptions"
                    ],
        "allowedTools":  [
                             "analytics_reader",
                             "knowledge_base"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CONTENT-PRODUCTION",
        "name":  "Content Production",
        "ownerAgentId":  "content",
        "type":  "DOMAIN",
        "mission":  "Create channel-specific marketing content aligned to approved strategy.",
        "inputs":  [
                       "company_context",
                       "strategy",
                       "brief",
                       "channel",
                       "funnel_stage"
                   ],
        "outputs":  [
                        "concepts",
                        "hooks",
                        "drafts",
                        "CTA",
                        "metadata",
                        "sources",
                        "QA_flags"
                    ],
        "allowedTools":  [
                             "knowledge_base",
                             "content_library"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CONTENT-OPTIMIZATION",
        "name":  "Content Optimization",
        "ownerAgentId":  "content",
        "type":  "DOMAIN",
        "mission":  "Improve drafts for audience, funnel stage, brand and measurable objectives.",
        "inputs":  [
                       "company_context",
                       "strategy",
                       "brief",
                       "channel",
                       "funnel_stage"
                   ],
        "outputs":  [
                        "concepts",
                        "hooks",
                        "drafts",
                        "CTA",
                        "metadata",
                        "sources",
                        "QA_flags"
                    ],
        "allowedTools":  [
                             "knowledge_base",
                             "content_library"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CAMPAIGN-DESIGN",
        "name":  "Campaign Design",
        "ownerAgentId":  "campaign",
        "type":  "DOMAIN",
        "mission":  "Design integrated campaigns connecting objectives, audience, offer and measurement.",
        "inputs":  [
                       "company_context",
                       "strategy",
                       "campaign_goal",
                       "budget"
                   ],
        "outputs":  [
                        "campaign_plan",
                        "audience",
                        "offer",
                        "messaging",
                        "assets",
                        "funnel",
                        "budget",
                        "KPIs",
                        "launch_checklist"
                    ],
        "allowedTools":  [
                             "analytics_reader",
                             "content_library",
                             "CRM"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CAMPAIGN-PLANNING",
        "name":  "Campaign Planning",
        "ownerAgentId":  "campaign",
        "type":  "DOMAIN",
        "mission":  "Convert strategy into executable campaign plans, assets, funnel and KPIs.",
        "inputs":  [
                       "company_context",
                       "strategy",
                       "campaign_goal",
                       "budget"
                   ],
        "outputs":  [
                        "campaign_plan",
                        "audience",
                        "offer",
                        "messaging",
                        "assets",
                        "funnel",
                        "budget",
                        "KPIs",
                        "launch_checklist"
                    ],
        "allowedTools":  [
                             "analytics_reader",
                             "content_library",
                             "CRM"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CREATIVE-CONCEPT",
        "name":  "Creative Concepts",
        "ownerAgentId":  "creative",
        "type":  "DOMAIN",
        "mission":  "Develop creative concepts, hooks and visual directions.",
        "inputs":  [
                       "brand",
                       "strategy",
                       "campaign",
                       "audience",
                       "channel"
                   ],
        "outputs":  [
                        "creative_concepts",
                        "hooks",
                        "visual_direction",
                        "copy_variants",
                        "formats",
                        "A_B_test_plan",
                        "QA_flags"
                    ],
        "allowedTools":  [
                             "brand_assets",
                             "image_generation_if_enabled",
                             "content_library"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CREATIVE-VARIANTS",
        "name":  "Creative Variants",
        "ownerAgentId":  "creative",
        "type":  "DOMAIN",
        "mission":  "Generate structured creative variants and testing plans.",
        "inputs":  [
                       "brand",
                       "strategy",
                       "campaign",
                       "audience",
                       "channel"
                   ],
        "outputs":  [
                        "creative_concepts",
                        "hooks",
                        "visual_direction",
                        "copy_variants",
                        "formats",
                        "A_B_test_plan",
                        "QA_flags"
                    ],
        "allowedTools":  [
                             "brand_assets",
                             "image_generation_if_enabled",
                             "content_library"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-SEO-STRATEGY",
        "name":  "SEO Strategy",
        "ownerAgentId":  "seo",
        "type":  "DOMAIN",
        "mission":  "Plan SEO initiatives aligned to business and marketing objectives.",
        "inputs":  [
                       "company_context",
                       "products",
                       "strategy",
                       "target_market"
                   ],
        "outputs":  [
                        "keyword_clusters",
                        "search_intent",
                        "content_briefs",
                        "on_page_actions",
                        "technical_recommendations",
                        "KPIs"
                    ],
        "allowedTools":  [
                             "web_search",
                             "keyword_research",
                             "website_reader",
                             "analytics_reader"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-SEO-OPTIMIZATION",
        "name":  "SEO Optimization",
        "ownerAgentId":  "seo",
        "type":  "DOMAIN",
        "mission":  "Analyze and optimize search-oriented content and opportunities.",
        "inputs":  [
                       "company_context",
                       "products",
                       "strategy",
                       "target_market"
                   ],
        "outputs":  [
                        "keyword_clusters",
                        "search_intent",
                        "content_briefs",
                        "on_page_actions",
                        "technical_recommendations",
                        "KPIs"
                    ],
        "allowedTools":  [
                             "web_search",
                             "keyword_research",
                             "website_reader",
                             "analytics_reader"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-ANALYTICS-PERFORMANCE",
        "name":  "Performance Analytics",
        "ownerAgentId":  "analytics",
        "type":  "DOMAIN",
        "mission":  "Measure campaign and business performance against defined KPIs.",
        "inputs":  [
                       "organization_id",
                       "campaign_data",
                       "CRM_data",
                       "revenue_data",
                       "goals"
                   ],
        "outputs":  [
                        "findings",
                        "evidence",
                        "root_causes",
                        "recommendations",
                        "expected_impact",
                        "priority",
                        "confidence"
                    ],
        "allowedTools":  [
                             "analytics_reader",
                             "CRM_reader",
                             "finance_reader"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-ANALYTICS-EXPERIMENTS",
        "name":  "Experiment Analysis",
        "ownerAgentId":  "analytics",
        "type":  "DOMAIN",
        "mission":  "Evaluate tests and translate results into evidence-backed insights.",
        "inputs":  [
                       "organization_id",
                       "campaign_data",
                       "CRM_data",
                       "revenue_data",
                       "goals"
                   ],
        "outputs":  [
                        "findings",
                        "evidence",
                        "root_causes",
                        "recommendations",
                        "expected_impact",
                        "priority",
                        "confidence"
                    ],
        "allowedTools":  [
                             "analytics_reader",
                             "CRM_reader",
                             "finance_reader"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-SALES-INTELLIGENCE",
        "name":  "Sales Intelligence",
        "ownerAgentId":  "sales",
        "type":  "DOMAIN",
        "mission":  "Analyze leads, opportunities, pipeline and next-best actions.",
        "inputs":  [
                       "lead",
                       "opportunity",
                       "company_context",
                       "sales_history"
                   ],
        "outputs":  [
                        "lead_score",
                        "qualification",
                        "risks",
                        "next_best_action",
                        "follow_up",
                        "proposal_inputs",
                        "objections"
                    ],
        "allowedTools":  [
                             "CRM",
                             "proposal_generator",
                             "knowledge_base"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-SALES-PROPOSALS",
        "name":  "Proposal Intelligence",
        "ownerAgentId":  "sales",
        "type":  "DOMAIN",
        "mission":  "Generate structured proposal recommendations from opportunity context.",
        "inputs":  [
                       "lead",
                       "opportunity",
                       "company_context",
                       "sales_history"
                   ],
        "outputs":  [
                        "lead_score",
                        "qualification",
                        "risks",
                        "next_best_action",
                        "follow_up",
                        "proposal_inputs",
                        "objections"
                    ],
        "allowedTools":  [
                             "CRM",
                             "proposal_generator",
                             "knowledge_base"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CS-HEALTH",
        "name":  "Customer Health",
        "ownerAgentId":  "customer-success",
        "type":  "DOMAIN",
        "mission":  "Assess customer health, retention and expansion signals.",
        "inputs":  [
                       "client_context",
                       "performance",
                       "approvals",
                       "usage",
                       "subscription"
                   ],
        "outputs":  [
                        "health_score",
                        "churn_risk",
                        "causes",
                        "actions",
                        "renewal_plan",
                        "upsell_opportunities"
                    ],
        "allowedTools":  [
                             "CRM",
                             "analytics_reader",
                             "billing_reader",
                             "tasks"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CS-RENEWAL",
        "name":  "Customer Retention",
        "ownerAgentId":  "customer-success",
        "type":  "DOMAIN",
        "mission":  "Identify renewal, upsell and churn-risk actions.",
        "inputs":  [
                       "client_context",
                       "performance",
                       "approvals",
                       "usage",
                       "subscription"
                   ],
        "outputs":  [
                        "health_score",
                        "churn_risk",
                        "causes",
                        "actions",
                        "renewal_plan",
                        "upsell_opportunities"
                    ],
        "allowedTools":  [
                             "CRM",
                             "analytics_reader",
                             "billing_reader",
                             "tasks"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-AUTOMATION-WORKFLOWS",
        "name":  "Workflow Automation",
        "ownerAgentId":  "automation",
        "type":  "DOMAIN",
        "mission":  "Define and coordinate approved automation workflows.",
        "inputs":  [
                       "workflow_request",
                       "organization_context",
                       "available_tools"
                   ],
        "outputs":  [
                        "workflow_definition",
                        "triggers",
                        "conditions",
                        "actions",
                        "permissions",
                        "approval_gates",
                        "failure_policy"
                    ],
        "allowedTools":  [
                             "workflow_engine",
                             "integrations_registry"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-AUTOMATION-EXECUTION",
        "name":  "Automation Execution",
        "ownerAgentId":  "automation",
        "type":  "DOMAIN",
        "mission":  "Execute workflow steps within policy, approval and tenant boundaries.",
        "inputs":  [
                       "workflow_request",
                       "organization_context",
                       "available_tools"
                   ],
        "outputs":  [
                        "workflow_definition",
                        "triggers",
                        "conditions",
                        "actions",
                        "permissions",
                        "approval_gates",
                        "failure_policy"
                    ],
        "allowedTools":  [
                             "workflow_engine",
                             "integrations_registry"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CFO-PROFITABILITY",
        "name":  "Profitability Intelligence",
        "ownerAgentId":  "cfo-intelligence",
        "type":  "DOMAIN",
        "mission":  "Analyze revenue, cost, margin and profitability signals.",
        "inputs":  [
                       "revenue",
                       "costs",
                       "subscriptions",
                       "usage",
                       "delivery_costs",
                       "pipeline"
                   ],
        "outputs":  [
                        "financial_findings",
                        "unit_economics",
                        "profitability",
                        "forecast",
                        "pricing_options",
                        "risks",
                        "recommendations"
                    ],
        "allowedTools":  [
                             "finance_reader",
                             "billing_reader",
                             "analytics_reader"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-CFO-FORECASTING",
        "name":  "Financial Forecasting",
        "ownerAgentId":  "cfo-intelligence",
        "type":  "DOMAIN",
        "mission":  "Produce evidence-backed financial forecasts and scenarios.",
        "inputs":  [
                       "revenue",
                       "costs",
                       "subscriptions",
                       "usage",
                       "delivery_costs",
                       "pipeline"
                   ],
        "outputs":  [
                        "financial_findings",
                        "unit_economics",
                        "profitability",
                        "forecast",
                        "pricing_options",
                        "risks",
                        "recommendations"
                    ],
        "allowedTools":  [
                             "finance_reader",
                             "billing_reader",
                             "analytics_reader"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-MENTOR-ADVISORY",
        "name":  "Business Advisory",
        "ownerAgentId":  "ai-business-mentor",
        "type":  "DOMAIN",
        "mission":  "Provide owner-level business guidance from permitted intelligence.",
        "inputs":  [
                       "business_metrics",
                       "pipeline",
                       "clients",
                       "profitability",
                       "goals",
                       "decisions"
                   ],
        "outputs":  [
                        "daily_priorities",
                        "decisions",
                        "rationale",
                        "expected_impact",
                        "risks",
                        "business_lesson",
                        "learning_question"
                    ],
        "allowedTools":  [
                             "CRM",
                             "finance_reader",
                             "analytics_reader",
                             "customer_success"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    },
    {
        "id":  "CAP-MENTOR-DECISION-SUPPORT",
        "name":  "Decision Support",
        "ownerAgentId":  "ai-business-mentor",
        "type":  "DOMAIN",
        "mission":  "Frame decisions, trade-offs and recommended next actions.",
        "inputs":  [
                       "business_metrics",
                       "pipeline",
                       "clients",
                       "profitability",
                       "goals",
                       "decisions"
                   ],
        "outputs":  [
                        "daily_priorities",
                        "decisions",
                        "rationale",
                        "expected_impact",
                        "risks",
                        "business_lesson",
                        "learning_question"
                    ],
        "allowedTools":  [
                             "CRM",
                             "finance_reader",
                             "analytics_reader",
                             "customer_success"
                         ],
        "deniedTools":  [

                        ],
        "approval":  "NONE",
        "risk":  "L1",
        "evaluatorId":  "SUP-007",
        "enabled":  true,
        "source":  "project2"
    }
];
export const PROJECT2_CAPABILITY_VERSION = 'project2-registry-v1';