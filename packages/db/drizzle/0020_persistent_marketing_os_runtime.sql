-- Forward-only persistence for Marketing OS plans and execution bindings.
-- The UUID primary key remains the storage identity; plan_id is the stable
-- application-level Commander plan identifier used by API and workflow calls.
ALTER TABLE marketing_os_plan_snapshots
  ADD COLUMN IF NOT EXISTS plan_id varchar(255);

UPDATE marketing_os_plan_snapshots
SET plan_id = id::text
WHERE plan_id IS NULL;

ALTER TABLE marketing_os_plan_snapshots
  ALTER COLUMN plan_id SET NOT NULL;

ALTER TABLE marketing_os_plan_snapshots
  ADD COLUMN IF NOT EXISTS acquisition jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_os_plan_tenant_plan_uidx
  ON marketing_os_plan_snapshots (tenant_id, plan_id);

CREATE TABLE IF NOT EXISTS marketing_os_execution_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  plan_id varchar(255) NOT NULL,
  engagement_id varchar(255) NOT NULL,
  locale varchar(16) NOT NULL,
  idempotency_key varchar(255) NOT NULL,
  workflow_id varchar(255),
  approval_id varchar(255),
  status varchar(32) NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_os_execution_tenant_plan_uidx
  ON marketing_os_execution_records (tenant_id, plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_os_execution_tenant_idempotency_uidx
  ON marketing_os_execution_records (tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS marketing_os_execution_tenant_updated_idx
  ON marketing_os_execution_records (tenant_id, updated_at);

-- The earlier 0019 policy already protects plan snapshots. The new execution
-- binding table gets the same transaction-local tenant boundary.
ALTER TABLE marketing_os_execution_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_os_execution_records_tenant_policy
  ON marketing_os_execution_records;
DROP POLICY IF EXISTS marketing_os_execution_records_tenant_isolation
  ON marketing_os_execution_records;
CREATE POLICY marketing_os_execution_records_tenant_policy
  ON marketing_os_execution_records
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
