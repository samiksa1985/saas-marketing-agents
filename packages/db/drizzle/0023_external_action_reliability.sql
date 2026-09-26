-- EPIC-05: provider-neutral delivery reliability and sanitized operational state.
-- No credential, OAuth token, secret, or raw provider response is persisted here.
-- The canonical opaque journal runner uses a reserved connection, so this
-- forward migration owns one PostgreSQL transaction for all schema changes.
BEGIN;
ALTER TABLE external_action_workflow_outbox
  DROP CONSTRAINT IF EXISTS external_action_workflow_outbox_delivery_status_check;
--> statement-breakpoint
ALTER TABLE external_action_workflow_outbox
  ADD COLUMN IF NOT EXISTS lease_id varchar(128),
  ADD COLUMN IF NOT EXISTS lease_owner varchar(255),
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_code varchar(128),
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_after_at timestamptz;
--> statement-breakpoint
UPDATE external_action_workflow_outbox
  SET next_attempt_at = occurred_at
  WHERE next_attempt_at IS NULL;
--> statement-breakpoint
ALTER TABLE external_action_workflow_outbox
  ADD CONSTRAINT external_action_workflow_outbox_delivery_status_check
  CHECK (delivery_status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS external_action_workflow_outbox_tenant_ready_idx
  ON external_action_workflow_outbox (tenant_id, delivery_status, next_attempt_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_provider_health (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider varchar(64) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'UNKNOWN'
    CHECK (status IN ('HEALTHY', 'DEGRADED', 'RATE_LIMITED', 'AUTH_FAILURE', 'UNAVAILABLE', 'UNKNOWN')),
  rolling_failure_count integer NOT NULL DEFAULT 0,
  last_successful_at timestamptz,
  last_failure_at timestamptz,
  retry_after_at timestamptz,
  cooldown_until timestamptz,
  recovery_probe_lease_until timestamptz,
  last_error_code varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_provider_health_tenant_provider_uidx UNIQUE (tenant_id, provider)
);
CREATE INDEX IF NOT EXISTS external_provider_health_tenant_status_idx
  ON external_provider_health (tenant_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_provider_credential_health (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider varchar(64) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'UNKNOWN'
    CHECK (status IN ('VALID', 'EXPIRING', 'EXPIRED', 'REVOKED', 'INVALID', 'MISSING', 'UNKNOWN')),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz,
  last_refresh_at timestamptz,
  last_failure_at timestamptz,
  disconnected_at timestamptz,
  rotation_required boolean NOT NULL DEFAULT false,
  last_error_code varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_provider_credential_health_tenant_provider_uidx UNIQUE (tenant_id, provider)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_action_operational_events (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider varchar(64) NOT NULL,
  external_action_id varchar(255) REFERENCES external_marketing_actions(id) ON DELETE CASCADE,
  workflow_run_id varchar(255),
  outbox_event_id varchar(255) REFERENCES external_action_workflow_outbox(id) ON DELETE CASCADE,
  event_type varchar(128) NOT NULL,
  correlation_id varchar(255) NOT NULL,
  latency_ms integer,
  error_code varchar(128),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_action_operational_events_tenant_provider_occurred_idx
  ON external_action_operational_events (tenant_id, provider, occurred_at);
CREATE INDEX IF NOT EXISTS external_action_operational_events_tenant_action_occurred_idx
  ON external_action_operational_events (tenant_id, external_action_id, occurred_at);
--> statement-breakpoint

ALTER TABLE external_provider_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_provider_health_tenant_policy ON external_provider_health;
CREATE POLICY external_provider_health_tenant_policy ON external_provider_health
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE external_provider_credential_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_provider_credential_health_tenant_policy ON external_provider_credential_health;
CREATE POLICY external_provider_credential_health_tenant_policy ON external_provider_credential_health
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE external_action_operational_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_action_operational_events_tenant_policy ON external_action_operational_events;
CREATE POLICY external_action_operational_events_tenant_policy ON external_action_operational_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
COMMIT;
