# Sales intelligence specification

Sales Intelligence uses canonical opportunities, accounts, and tenant ownership. It implements deterministic lead scoring, a weighted pipeline forecast using shared opportunity-stage probabilities, and approval-governed proposal drafts. Opportunities outside the requested period are excluded; proposal construction rejects cross-tenant inputs.

CFO is related but distinct: profitability uses direct costs, scenario modeling deliberately emits `MODELED` values, and deterministic CFO forecasting combines date-bound actual revenue with open opportunity weighting. It preserves `ACTUAL`, `ESTIMATED`, or `MODELED` provenance and evidence IDs; it does not invent financial figures. Persistence has tenant guards, with forecast storage introduced by migration 0018 but not executed. UX route `/sales-crm` maps to canonical composition state.
