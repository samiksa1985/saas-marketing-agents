# AI Marketing OS — Domain Model V1

## Identity / tenancy
- Organization
- User
- Session
- Role
- Permission
- OrganizationMembership

## Commercial
- Plan
- PlanFeature
- AddOn
- Subscription
- SubscriptionItem
- Invoice
- Payment
- Coupon
- UsageEntitlement

## CRM / sales
- Company
- Contact
- Lead
- Opportunity
- Activity
- Task
- Proposal
- ProposalVersion
- ContractReference
- Renewal
- UpsellOpportunity

## Company intelligence
- CompanyProfile
- Product
- Service
- ICP
- Persona
- Competitor
- Positioning
- BrandProfile
- BrandAsset
- BusinessGoal
- KPI

## Marketing
- Strategy
- StrategyVersion
- Campaign
- CampaignAsset
- CreativeBrief
- CreativeVariant
- ContentItem
- ContentVersion
- ContentCalendarEntry
- SEOProject
- Keyword
- TopicCluster
- SEORecommendation
- LandingPage

## Analytics / growth
- MetricDefinition
- MetricValue
- AnalyticsEvent
- AttributionRecord
- Recommendation
- ClientHealth
- GrowthExperiment
- ExperimentVariant

## Finance
- RevenueRecord
- CostRecord
- CostCategory
- ClientProfitabilitySnapshot
- PackageProfitabilitySnapshot
- Forecast
- ForecastScenario
- CashFlowSnapshot

## Knowledge / RAG
- Document
- DocumentChunk
- Embedding
- KnowledgeSource
- RetrievalEvent
- SourceCitation

## AI platform
- Agent
- AgentToolPermission
- Prompt
- PromptVersion
- ModelConfig
- AgentRun
- Tool
- ToolRun
- AgentHandoff
- AIUsageEvent
- EvaluationDataset
- EvaluationCase
- EvaluationRun

## Workflow / operations
- WorkflowDefinition
- WorkflowVersion
- WorkflowRun
- WorkflowStep
- Approval
- AutomationRule
- AutomationRun
- SLA
- Notification

## Integrations
- IntegrationProvider
- OrganizationIntegration
- IntegrationCredentialReference
- WebhookSubscription
- SyncRun

## Governance
- AuditLog
- DataExportRequest
- DataDeletionRequest
- FeatureFlag

## Design rule

All tenant-owned domain entities must carry organization scope directly or through a strictly validated parent relationship. Cross-tenant joins are prohibited at the application and tool layers.
