CREATE TABLE IF NOT EXISTS codecore_workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workflow_id varchar(255) NOT NULL,
  workflow_type varchar(120) NOT NULL,
  engagement_id varchar(255),
  locale varchar(16) NOT NULL DEFAULT 'en',
  selected_workstream_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(40) NOT NULL DEFAULT 'pending',
  version integer NOT NULL DEFAULT 1,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner varchar(200),
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  terminal_at timestamptz,
  idempotency_key varchar(255) NOT NULL,
  error_code varchar(120),
  error_message text,
  approval_id varchar(255),
  approval_status varchar(40),
  input_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT codecore_workflow_execution_status_check
    CHECK (status IN (
      'pending',
      'claimed',
      'running',
      'waiting_approval',
      'retry_scheduled',
      'completed',
      'failed',
      'cancelled'
    )),
  CONSTRAINT codecore_workflow_execution_approval_status_check
    CHECK (approval_status IS NULL OR approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  CONSTRAINT codecore_workflow_execution_attempts_check
    CHECK (attempt_count >= 0 AND attempt_count <= max_attempts),
  CONSTRAINT codecore_workflow_execution_max_attempts_check
    CHECK (max_attempts >= 1 AND max_attempts <= 100),
  CONSTRAINT codecore_workflow_execution_tenant_key_uidx
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS codecore_workflow_execution_claim_idx
  ON codecore_workflow_executions (status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS codecore_workflow_execution_tenant_idx
  ON codecore_workflow_executions (tenant_id, id);
CREATE INDEX IF NOT EXISTS codecore_workflow_execution_approval_idx
  ON codecore_workflow_executions (tenant_id, approval_id);

ALTER TABLE codecore_workflow_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS codecore_workflow_executions_tenant_policy
  ON codecore_workflow_executions;
CREATE POLICY codecore_workflow_executions_tenant_policy
  ON codecore_workflow_executions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS codecore_workflow_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  execution_id uuid NOT NULL REFERENCES codecore_workflow_executions(id) ON DELETE CASCADE,
  event_type varchar(120) NOT NULL,
  actor varchar(255) NOT NULL,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS codecore_workflow_execution_events_tenant_idx
  ON codecore_workflow_execution_events (tenant_id, execution_id, occurred_at);

ALTER TABLE codecore_workflow_execution_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS codecore_workflow_execution_events_tenant_policy
  ON codecore_workflow_execution_events;
CREATE POLICY codecore_workflow_execution_events_tenant_policy
  ON codecore_workflow_execution_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION codecore_touch_workflow_execution() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS codecore_workflow_executions_touch
  ON codecore_workflow_executions;
CREATE TRIGGER codecore_workflow_executions_touch
  BEFORE UPDATE ON codecore_workflow_executions
  FOR EACH ROW
  EXECUTE FUNCTION codecore_touch_workflow_execution();
