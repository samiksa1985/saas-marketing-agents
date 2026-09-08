-- Provider-neutral durable intent and evidence for governed external side effects.
-- Google Ads is the first adapter; no credential material is stored here.
CREATE TABLE IF NOT EXISTS external_action_policies (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id varchar(255) NOT NULL,
  provider varchar(64) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  execution_mode varchar(16) NOT NULL DEFAULT 'DISABLED' CHECK (execution_mode IN ('DISABLED', 'DRY_RUN', 'REAL')),
  allowed_action_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  denied_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_campaigns jsonb NOT NULL DEFAULT '[]'::jsonb,
  denied_campaigns jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_absolute_budget_delta real NOT NULL,
  max_percentage_budget_delta real NOT NULL,
  monthly_spend_ceiling real NOT NULL,
  minimum_confidence real NOT NULL CHECK (minimum_confidence >= 0 AND minimum_confidence <= 1),
  required_evidence boolean NOT NULL DEFAULT true,
  approval_mode varchar(16) NOT NULL DEFAULT 'HUMAN' CHECK (approval_mode IN ('NONE', 'HUMAN')),
  required_approval_role varchar(128),
  kill_switch boolean NOT NULL DEFAULT true,
  dry_run_only boolean NOT NULL DEFAULT true,
  execution_hours jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by varchar(255) NOT NULL,
  updated_by varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_action_policies_tenant_provider_uidx UNIQUE (tenant_id, provider)
);
CREATE INDEX IF NOT EXISTS external_action_policies_tenant_provider_idx
  ON external_action_policies (tenant_id, provider);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_action_policy_audit (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  policy_id varchar(255) NOT NULL REFERENCES external_action_policies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  actor varchar(255) NOT NULL,
  event_type varchar(64) NOT NULL,
  snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_action_policy_audit_tenant_policy_idx
  ON external_action_policy_audit (tenant_id, policy_id, version);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_marketing_actions (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id varchar(255) NOT NULL,
  actor varchar(255) NOT NULL,
  agent_identity varchar(255) NOT NULL,
  workflow_run_id varchar(255) NOT NULL,
  recommendation_id varchar(255) NOT NULL,
  provider varchar(64) NOT NULL,
  account_id varchar(255) NOT NULL,
  campaign_id varchar(255),
  action_type varchar(96) NOT NULL,
  target_lock_key varchar(640) NOT NULL,
  proposal jsonb NOT NULL,
  status varchar(48) NOT NULL,
  approval_id varchar(255),
  simulation jsonb,
  budget_decision jsonb,
  policy_decision jsonb,
  policy_version integer,
  execution jsonb,
  verification jsonb,
  before_state jsonb,
  failure_code varchar(128),
  failure_message text,
  idempotency_key varchar(255) NOT NULL,
  expires_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  requested_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_marketing_actions_status_check CHECK (status IN (
    'DRAFT', 'PROPOSED', 'SIMULATED', 'BUDGET_APPROVED', 'POLICY_APPROVED',
    'APPROVAL_REQUIRED', 'AWAITING_APPROVAL', 'APPROVED', 'DISPATCHING',
    'EXECUTING', 'DISPATCHED', 'VERIFYING', 'VERIFIED', 'ACKNOWLEDGED',
    'FAILED', 'REJECTED', 'CANCELLED', 'ROLLBACK_REQUIRED', 'ROLLED_BACK'
  ))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS external_marketing_actions_tenant_provider_action_idempotency_uidx
  ON external_marketing_actions (tenant_id, provider, id, idempotency_key);
CREATE INDEX IF NOT EXISTS external_marketing_actions_tenant_status_idx
  ON external_marketing_actions (tenant_id, status);
-- Durable concurrency control: only one non-terminal mutation may target a campaign/account.
CREATE UNIQUE INDEX IF NOT EXISTS external_marketing_actions_active_target_uidx
  ON external_marketing_actions (tenant_id, provider, target_lock_key)
  WHERE status IN (
    'DRAFT', 'PROPOSED', 'SIMULATED', 'BUDGET_APPROVED', 'POLICY_APPROVED',
    'APPROVAL_REQUIRED', 'AWAITING_APPROVAL', 'APPROVED', 'DISPATCHING',
    'EXECUTING', 'DISPATCHED', 'VERIFYING'
  );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_marketing_action_evidence (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  action_id varchar(255) NOT NULL REFERENCES external_marketing_actions(id) ON DELETE CASCADE,
  type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_marketing_action_evidence_tenant_action_idx
  ON external_marketing_action_evidence (tenant_id, action_id, occurred_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_action_workflow_outbox (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workflow_run_id varchar(255) NOT NULL,
  external_action_id varchar(255) NOT NULL REFERENCES external_marketing_actions(id) ON DELETE CASCADE,
  event_type varchar(128) NOT NULL,
  state varchar(48) NOT NULL,
  provider varchar(64) NOT NULL,
  account_id varchar(255) NOT NULL,
  campaign_id varchar(255),
  verification_status varchar(32),
  correlation_id varchar(255) NOT NULL,
  idempotency_key varchar(320) NOT NULL,
  payload jsonb NOT NULL,
  delivery_status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'FAILED')),
  delivery_attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz,
  last_error text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_action_workflow_outbox_tenant_idempotency_uidx UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS external_action_workflow_outbox_tenant_delivery_idx
  ON external_action_workflow_outbox (tenant_id, delivery_status, occurred_at);
--> statement-breakpoint

ALTER TABLE external_action_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_action_policies_tenant_policy ON external_action_policies;
CREATE POLICY external_action_policies_tenant_policy ON external_action_policies
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE external_action_policy_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_action_policy_audit_tenant_policy ON external_action_policy_audit;
CREATE POLICY external_action_policy_audit_tenant_policy ON external_action_policy_audit
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE external_marketing_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_marketing_actions_tenant_policy ON external_marketing_actions;
CREATE POLICY external_marketing_actions_tenant_policy ON external_marketing_actions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE external_marketing_action_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_marketing_action_evidence_tenant_policy ON external_marketing_action_evidence;
CREATE POLICY external_marketing_action_evidence_tenant_policy ON external_marketing_action_evidence
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE external_action_workflow_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_action_workflow_outbox_tenant_policy ON external_action_workflow_outbox;
CREATE POLICY external_action_workflow_outbox_tenant_policy ON external_action_workflow_outbox
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
