-- EPIC-08: provider-neutral read-only performance evidence and the durable
-- optimization decision trail. Provider mutations remain exclusively in the
-- existing governed external-action pipeline.
BEGIN;

CREATE TABLE IF NOT EXISTS campaign_performance_observations (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unified_campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  channel_id varchar(255) NOT NULL,
  provider varchar(64) NOT NULL,
  provider_campaign_id varchar(255) NOT NULL,
  snapshot_id varchar(255) NOT NULL,
  idempotency_key varchar(255) NOT NULL,
  observation jsonb NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  collected_at timestamptz NOT NULL,
  verification_state varchar(16) NOT NULL CHECK (verification_state IN ('VERIFIED', 'UNVERIFIED', 'UNKNOWN', 'MISMATCH')),
  freshness_state varchar(16) NOT NULL CHECK (freshness_state IN ('FRESH', 'STALE', 'UNKNOWN')),
  normalization_version varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_performance_observation_tenant_idempotency_uidx UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT campaign_performance_observation_tenant_provider_snapshot_uidx UNIQUE (tenant_id, provider, provider_campaign_id, snapshot_id, normalization_version)
);
CREATE INDEX IF NOT EXISTS campaign_performance_observation_tenant_campaign_period_idx
  ON campaign_performance_observations (tenant_id, unified_campaign_id, period_end);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS campaign_performance_aggregates (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unified_campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  aggregate jsonb NOT NULL,
  generated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_performance_aggregate_tenant_campaign_id_uidx UNIQUE (tenant_id, unified_campaign_id, id)
);
CREATE INDEX IF NOT EXISTS campaign_performance_aggregate_tenant_campaign_generated_idx
  ON campaign_performance_aggregates (tenant_id, unified_campaign_id, generated_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS campaign_performance_diagnostics (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unified_campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  channel_id varchar(255),
  type varchar(80) NOT NULL,
  diagnostic jsonb NOT NULL,
  generated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_performance_diagnostic_tenant_id_uidx UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS campaign_performance_diagnostic_tenant_campaign_generated_idx
  ON campaign_performance_diagnostics (tenant_id, unified_campaign_id, generated_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS campaign_performance_anomalies (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unified_campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  type varchar(64) NOT NULL,
  anomaly jsonb NOT NULL,
  generated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_performance_anomaly_tenant_id_uidx UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS campaign_performance_anomaly_tenant_campaign_generated_idx
  ON campaign_performance_anomalies (tenant_id, unified_campaign_id, generated_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS campaign_optimization_recommendations (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unified_campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  channel_id varchar(255),
  provider varchar(64),
  action_type varchar(64) NOT NULL,
  recommendation jsonb NOT NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_optimization_recommendation_tenant_id_uidx UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS campaign_optimization_recommendation_tenant_campaign_created_idx
  ON campaign_optimization_recommendations (tenant_id, unified_campaign_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS campaign_optimization_simulations (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unified_campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  recommendation_id varchar(255) NOT NULL REFERENCES campaign_optimization_recommendations(id) ON DELETE CASCADE,
  simulation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_optimization_simulation_tenant_recommendation_uidx UNIQUE (tenant_id, recommendation_id)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS campaign_optimization_outcomes (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unified_campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  recommendation_id varchar(255) NOT NULL REFERENCES campaign_optimization_recommendations(id) ON DELETE CASCADE,
  external_action_id varchar(255) NOT NULL REFERENCES external_marketing_actions(id) ON DELETE RESTRICT,
  outcome jsonb NOT NULL,
  measured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_optimization_outcome_tenant_action_uidx UNIQUE (tenant_id, external_action_id)
);
CREATE INDEX IF NOT EXISTS campaign_optimization_outcome_tenant_campaign_measured_idx
  ON campaign_optimization_outcomes (tenant_id, unified_campaign_id, measured_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS campaign_optimization_learning (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unified_campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  recommendation_id varchar(255) NOT NULL REFERENCES campaign_optimization_recommendations(id) ON DELETE CASCADE,
  learning jsonb NOT NULL,
  rule_version varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_optimization_learning_tenant_id_uidx UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS campaign_optimization_learning_tenant_campaign_created_idx
  ON campaign_optimization_learning (tenant_id, unified_campaign_id, created_at);
--> statement-breakpoint

ALTER TABLE campaign_performance_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_performance_observations_tenant_policy ON campaign_performance_observations;
CREATE POLICY campaign_performance_observations_tenant_policy ON campaign_performance_observations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE campaign_performance_aggregates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_performance_aggregates_tenant_policy ON campaign_performance_aggregates;
CREATE POLICY campaign_performance_aggregates_tenant_policy ON campaign_performance_aggregates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE campaign_performance_diagnostics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_performance_diagnostics_tenant_policy ON campaign_performance_diagnostics;
CREATE POLICY campaign_performance_diagnostics_tenant_policy ON campaign_performance_diagnostics
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE campaign_performance_anomalies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_performance_anomalies_tenant_policy ON campaign_performance_anomalies;
CREATE POLICY campaign_performance_anomalies_tenant_policy ON campaign_performance_anomalies
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE campaign_optimization_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_optimization_recommendations_tenant_policy ON campaign_optimization_recommendations;
CREATE POLICY campaign_optimization_recommendations_tenant_policy ON campaign_optimization_recommendations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE campaign_optimization_simulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_optimization_simulations_tenant_policy ON campaign_optimization_simulations;
CREATE POLICY campaign_optimization_simulations_tenant_policy ON campaign_optimization_simulations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE campaign_optimization_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_optimization_outcomes_tenant_policy ON campaign_optimization_outcomes;
CREATE POLICY campaign_optimization_outcomes_tenant_policy ON campaign_optimization_outcomes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE campaign_optimization_learning ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_optimization_learning_tenant_policy ON campaign_optimization_learning;
CREATE POLICY campaign_optimization_learning_tenant_policy ON campaign_optimization_learning
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
COMMIT;
