# Agent system specification

The current registry test discovers **71 agents** and the capability registry contains **28 capabilities**. Definitions are loaded from canonical repository sources through `@platform/registry`; do not replace this with a copied roster. Control roles, Marketing Commander, domain leaders, specialists, advisory agents, and workflow agents remain distinct.

Agent Runtime assembles a definition, prompt, tenant context, validation, provider/tool boundaries, and artifact lifecycle. Outputs are proposed draft artifacts with evidence and confidence. Accepted artifacts create governed handoffs; agents cannot decide human approvals. Tool use is routed through Tool Gateway and applies capability, permission, tenant, and approval restrictions.

Domain leaders own capability IDs while specialists contribute scoped work. Risk and approval requirements live in capability records. CFO owns `CAP-CFO-FORECASTING`, enabled for deterministic pipeline/actual forecasting; scenario modeling remains distinct. Provider credentials and production models are configuration concerns, not registry facts.
