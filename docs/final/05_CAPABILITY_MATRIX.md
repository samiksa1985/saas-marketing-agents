# Capability matrix

The canonical registry contains 28 enabled `CAP-*` records. Each carries inputs, outputs, allowed/denied tools, approval, risk, and enabled state in `packages/registry/src/capabilities.ts`; the shared contract shape is in `packages/contracts/src/marketing-agent-system.ts`.

| Capability ID | Outcome | Owner | Type / risk / approval |
| --- | --- | --- | --- |
| `CAP-ORCH-ROUTING` | Intent routing | `ai-orchestrator` | CORE / L1 / NONE |
| `CAP-ORCH-COORDINATION` | Execution coordination | `ai-orchestrator` | CORE / L1 / NONE |
| `CAP-BI-COMPANY-INTELLIGENCE` | Company intelligence | `business-intelligence` | DOMAIN / L1 / NONE |
| `CAP-BI-CROSS-DOMAIN` | Cross-domain intelligence | `business-intelligence` | DOMAIN / L1 / NONE |
| `CAP-MKT-RESEARCH` | Market research | `market-research` | DOMAIN / L1 / NONE |
| `CAP-MKT-TREND-INTELLIGENCE` | Trend intelligence | `market-research` | DOMAIN / L1 / NONE |
| `CAP-MKT-STRATEGY` | Marketing strategy | `marketing-strategist` | DOMAIN / L1 / NONE |
| `CAP-MKT-PRIORITIZATION` | Marketing prioritization | `marketing-strategist` | DOMAIN / L1 / NONE |
| `CAP-CONTENT-PRODUCTION` | Content production | `content` | DOMAIN / L1 / NONE |
| `CAP-CONTENT-OPTIMIZATION` | Content optimization | `content` | DOMAIN / L1 / NONE |
| `CAP-CAMPAIGN-DESIGN` | Campaign design | `campaign` | DOMAIN / L1 / NONE |
| `CAP-CAMPAIGN-PLANNING` | Campaign planning | `campaign` | DOMAIN / L1 / NONE |
| `CAP-CREATIVE-CONCEPT` | Creative concepts | `creative` | DOMAIN / L1 / NONE |
| `CAP-CREATIVE-VARIANTS` | Creative variants | `creative` | DOMAIN / L1 / NONE |
| `CAP-SEO-STRATEGY` | SEO strategy | `seo` | DOMAIN / L1 / NONE |
| `CAP-SEO-OPTIMIZATION` | SEO optimization | `seo` | DOMAIN / L1 / NONE |
| `CAP-ANALYTICS-PERFORMANCE` | Performance analytics | `analytics` | DOMAIN / L1 / NONE |
| `CAP-ANALYTICS-EXPERIMENTS` | Experiment analysis | `analytics` | DOMAIN / L1 / NONE |
| `CAP-SALES-INTELLIGENCE` | Sales intelligence | `sales` | DOMAIN / L1 / NONE |
| `CAP-SALES-PROPOSALS` | Proposal intelligence | `sales` | DOMAIN / L1 / NONE |
| `CAP-CS-HEALTH` | Customer health | `customer-success` | DOMAIN / L1 / NONE |
| `CAP-CS-RENEWAL` | Customer retention | `customer-success` | DOMAIN / L1 / NONE |
| `CAP-AUTOMATION-WORKFLOWS` | Workflow automation | `automation` | DOMAIN / L1 / NONE |
| `CAP-AUTOMATION-EXECUTION` | Automation execution | `automation` | DOMAIN / L1 / NONE |
| `CAP-CFO-PROFITABILITY` | Profitability intelligence | `cfo-intelligence` | DOMAIN / L1 / NONE |
| `CAP-CFO-FORECASTING` | Financial forecasting | `cfo-intelligence` | DOMAIN / L1 / NONE |
| `CAP-MENTOR-ADVISORY` | Business advisory | `ai-business-mentor` | DOMAIN / L1 / NONE |
| `CAP-MENTOR-DECISION-SUPPORT` | Decision support | `ai-business-mentor` | DOMAIN / L1 / NONE |

The capability records are enabled registry definitions, not evidence that all dependent external providers are operational. Tenant records remain tenant-aware; billing usage is entitlement-sensitive; publishing requires approval and the Tool Gateway. Production dependencies remain in `PRODUCTION_READINESS_GATES.md`.
