CREATE TYPE financial_status AS ENUM (
  'ACTUAL',
  'ESTIMATED',
  'MODELED'
);

CREATE TYPE cfo_recommendation_priority AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW'
);

CREATE TYPE cfo_recommendation_type AS ENUM (
  'MARGIN',
  'COST',
  'PRICING',
  'FORECAST',
  'RETENTION',
  'GROWTH'
);

CREATE TABLE client_profitability_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id text NOT NULL,
  account_id text,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  revenue jsonb NOT NULL,
  direct_cost jsonb NOT NULL,
  gross_contribution jsonb NOT NULL,
  gross_margin_pct jsonb NOT NULL,
  operating_expense jsonb,
  operating_contribution jsonb,
  evidence_ids jsonb NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE financial_scenario_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id text,
  projected_revenue jsonb NOT NULL,
  projected_variable_cost jsonb NOT NULL,
  projected_fixed_cost jsonb NOT NULL,
  projected_contribution jsonb NOT NULL,
  projected_margin_pct jsonb NOT NULL,
  break_even_revenue jsonb,
  evidence_ids jsonb NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cfo_recommendations (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id text,
  type cfo_recommendation_type NOT NULL,
  priority cfo_recommendation_priority NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL,
  action text NOT NULL,
  confidence real NOT NULL,
  evidence_ids jsonb NOT NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_profitability_tenant_customer
  ON client_profitability_assessments (
    tenant_id,
    customer_id,
    created_at DESC
  );

CREATE INDEX idx_financial_scenario_tenant_customer
  ON financial_scenario_snapshots (
    tenant_id,
    customer_id,
    created_at DESC
  );

CREATE INDEX idx_cfo_recommendation_tenant_customer
  ON cfo_recommendations (
    tenant_id,
    customer_id,
    created_at DESC
  );

ALTER TABLE client_profitability_assessments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE financial_scenario_snapshots
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE cfo_recommendations
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_client_profitability
  ON client_profitability_assessments
  USING (
    tenant_id::text =
    current_setting(
      'app.tenant_id',
      true
    )
  );

CREATE POLICY tenant_financial_scenarios
  ON financial_scenario_snapshots
  USING (
    tenant_id::text =
    current_setting(
      'app.tenant_id',
      true
    )
  );

CREATE POLICY tenant_cfo_recommendations
  ON cfo_recommendations
  USING (
    tenant_id::text =
    current_setting(
      'app.tenant_id',
      true
    )
  );
