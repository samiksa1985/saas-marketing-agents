CREATE TABLE IF NOT EXISTS automation_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name varchar(200) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  trigger_type varchar(30) NOT NULL,
  trigger_config jsonb NOT NULL,
  condition_mode varchar(10) NOT NULL,
  conditions jsonb NOT NULL,
  workflow_reference varchar(240) NOT NULL,
  locale varchar(12) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_definitions_tenant_enabled_idx
  ON automation_definitions (tenant_id, enabled);

CREATE INDEX IF NOT EXISTS automation_definitions_tenant_trigger_idx
  ON automation_definitions (tenant_id, trigger_type);


CREATE TABLE IF NOT EXISTS automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  automation_id uuid NOT NULL
    REFERENCES automation_definitions(id)
    ON DELETE CASCADE,
  idempotency_key varchar(240) NOT NULL,
  trigger_type varchar(30) NOT NULL,
  status varchar(30) NOT NULL,
  workflow_id varchar(240),
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_executions_tenant_idempotency_unique
    UNIQUE (tenant_id, automation_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS automation_executions_tenant_status_idx
  ON automation_executions (tenant_id, status);


ALTER TABLE automation_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS automation_definitions_tenant_policy
  ON automation_definitions;

CREATE POLICY automation_definitions_tenant_policy
  ON automation_definitions
  USING (
    tenant_id =
      NULLIF(
        current_setting('app.tenant_id', true),
        ''
      )::uuid
  )
  WITH CHECK (
    tenant_id =
      NULLIF(
        current_setting('app.tenant_id', true),
        ''
      )::uuid
  );


DROP POLICY IF EXISTS automation_executions_tenant_policy
  ON automation_executions;

CREATE POLICY automation_executions_tenant_policy
  ON automation_executions
  USING (
    tenant_id =
      NULLIF(
        current_setting('app.tenant_id', true),
        ''
      )::uuid
  )
  WITH CHECK (
    tenant_id =
      NULLIF(
        current_setting('app.tenant_id', true),
        ''
      )::uuid
  );
