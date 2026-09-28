# AI Marketing OS — Database V1.1

The database is now designed around the full product scope rather than the MVP.

## Domains

- Identity & tenancy: Organization, User, OrganizationMembership, Session
- Company intelligence: CompanyProfile, Product, BrandAsset
- CRM & revenue: Lead, Contact, Opportunity, Activity, Proposal, Deal
- Marketing: Strategy, Campaign, ContentItem, CreativeBrief, SEOProject, SEOTask, Report, Experiment
- Approvals: Approval, ApprovalRequest
- Knowledge: Document, DocumentChunk
- AI platform: Agent, PromptVersion, Tool, AgentToolPermission, AgentRun, ToolCall, UsageEvent, PromptEvaluation
- Workflows: WorkflowRun, WorkflowStep, Task, Notification, Automation, AutomationRun
- Memory: Memory
- Integrations: Integration, ApiKey, Webhook
- Finance & customer economics: Plan, Subscription, Invoice, FeatureEntitlement, UsageCounter, CustomerAccount, Expense, RevenueRecord, PaymentRecord, Contract, Renewal, Upsell
- Governance: AuditLog, DataExport, DataDeletionRequest

## Tenant rule

Every customer-owned operational entity carries `organizationId`, either directly or through a documented parent relation. Application authorization must enforce tenant scope server-side.

## Billing/entitlements

Plan pricing remains configurable. FeatureEntitlement and UsageCounter provide plan-level and organization-level entitlements without hard-coding Starter/Growth/Scale pricing into business logic.

## AI governance

AgentRun, ToolCall, UsageEvent, PromptVersion, PromptEvaluation and AuditLog provide execution traceability, cost tracking, prompt versioning and evaluation hooks.
