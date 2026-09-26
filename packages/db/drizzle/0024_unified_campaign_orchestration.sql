-- EPIC-07: tenant-scoped unified campaign intent. These tables coordinate
-- provider-neutral plans and reference the existing governed external-action
-- control plane; they do not contain provider credentials, approvals, or an outbox.
BEGIN;

CREATE TABLE IF NOT EXISTS unified_campaigns (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  idempotency_key varchar(255) NOT NULL,
  organization_id varchar(255) NOT NULL,
  objective varchar(64) NOT NULL,
  goal text NOT NULL,
  locale varchar(16) NOT NULL,
  currency varchar(3) NOT NULL,
  total_budget_minor bigint NOT NULL CHECK (total_budget_minor > 0),
  minor_unit_scale integer NOT NULL CHECK (minor_unit_scale >= 0 AND minor_unit_scale <= 6),
  lifecycle varchar(32) NOT NULL CHECK (lifecycle IN (
    'DRAFT', 'PLANNED', 'SIMULATED', 'AWAITING_APPROVAL', 'APPROVED', 'EXECUTING',
    'ACTIVE', 'PARTIALLY_ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'DEGRADED'
  )),
  definition jsonb NOT NULL,
  execution_plan jsonb,
  workflow_id varchar(255),
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unified_campaigns_tenant_idempotency_uidx UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS unified_campaigns_tenant_lifecycle_idx
  ON unified_campaigns (tenant_id, lifecycle, updated_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS unified_campaign_execution_steps (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  channel_id varchar(255) NOT NULL,
  provider varchar(64) NOT NULL,
  account_id varchar(255) NOT NULL,
  campaign_resource_id varchar(255) NOT NULL,
  external_action_id varchar(255) REFERENCES external_marketing_actions(id) ON DELETE SET NULL,
  idempotency_key varchar(255) NOT NULL,
  allocation jsonb NOT NULL,
  proposal jsonb NOT NULL,
  outcome jsonb,
  status varchar(32) NOT NULL CHECK (status IN ('PLANNED', 'SUBMITTED', 'VERIFIED', 'PAUSED', 'FAILED', 'UNAVAILABLE', 'MISMATCH', 'UNKNOWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unified_campaign_execution_steps_tenant_campaign_channel_uidx UNIQUE (tenant_id, campaign_id, channel_id),
  CONSTRAINT unified_campaign_execution_steps_tenant_idempotency_uidx UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS unified_campaign_execution_steps_tenant_campaign_idx
  ON unified_campaign_execution_steps (tenant_id, campaign_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS unified_campaign_performance_snapshots (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  channel_id varchar(255) NOT NULL,
  provider varchar(64) NOT NULL,
  currency varchar(3) NOT NULL,
  metrics jsonb NOT NULL,
  provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification varchar(16) NOT NULL CHECK (verification IN ('VERIFIED', 'UNVERIFIED', 'UNKNOWN')),
  captured_at timestamptz NOT NULL,
  freshness_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unified_campaign_performance_tenant_campaign_captured_idx
  ON unified_campaign_performance_snapshots (tenant_id, campaign_id, captured_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS unified_campaign_recommendations (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  campaign_id varchar(255) NOT NULL REFERENCES unified_campaigns(id) ON DELETE CASCADE,
  type varchar(64) NOT NULL,
  recommendation jsonb NOT NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unified_campaign_recommendations_tenant_campaign_id_uidx UNIQUE (tenant_id, campaign_id, id)
);
CREATE INDEX IF NOT EXISTS unified_campaign_recommendations_tenant_campaign_created_idx
  ON unified_campaign_recommendations (tenant_id, campaign_id, created_at);
--> statement-breakpoint

ALTER TABLE unified_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unified_campaigns_tenant_policy ON unified_campaigns;
CREATE POLICY unified_campaigns_tenant_policy ON unified_campaigns
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE unified_campaign_execution_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unified_campaign_execution_steps_tenant_policy ON unified_campaign_execution_steps;
CREATE POLICY unified_campaign_execution_steps_tenant_policy ON unified_campaign_execution_steps
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE unified_campaign_performance_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unified_campaign_performance_snapshots_tenant_policy ON unified_campaign_performance_snapshots;
CREATE POLICY unified_campaign_performance_snapshots_tenant_policy ON unified_campaign_performance_snapshots
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE unified_campaign_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unified_campaign_recommendations_tenant_policy ON unified_campaign_recommendations;
CREATE POLICY unified_campaign_recommendations_tenant_policy ON unified_campaign_recommendations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
COMMIT;
