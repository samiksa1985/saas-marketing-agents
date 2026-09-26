CREATE TABLE IF NOT EXISTS marketing_execution_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  domain varchar(30) NOT NULL,
  capability_id varchar(80) NOT NULL,
  workflow_id varchar(240) NOT NULL,
  task_id varchar(240) NOT NULL,
  workstream_id varchar(240) NOT NULL,
  status varchar(40) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  output jsonb NOT NULL,
  evidence_ids jsonb NOT NULL,
  approval_id varchar(240),
  approved_conditions jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS
  marketing_execution_tenant_domain_idx
ON marketing_execution_artifacts (
  tenant_id,
  domain
);

CREATE INDEX IF NOT EXISTS
  marketing_execution_tenant_workflow_idx
ON marketing_execution_artifacts (
  tenant_id,
  workflow_id
);

CREATE UNIQUE INDEX IF NOT EXISTS
  marketing_execution_tenant_artifact_version_uidx
ON marketing_execution_artifacts (
  tenant_id,
  id,
  version
);


CREATE TABLE IF NOT EXISTS marketing_execution_approval_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  artifact_id uuid NOT NULL
    REFERENCES marketing_execution_artifacts(id)
    ON DELETE CASCADE,
  approval_id varchar(240) NOT NULL,
  status varchar(40) NOT NULL,
  conditions jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_execution_approval_tenant_artifact_unique
    UNIQUE (
      tenant_id,
      artifact_id
    )
);


CREATE TABLE IF NOT EXISTS marketing_execution_workflow_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  artifact_id uuid NOT NULL
    REFERENCES marketing_execution_artifacts(id)
    ON DELETE CASCADE,
  workflow_id varchar(240) NOT NULL,
  task_id varchar(240) NOT NULL,
  workstream_id varchar(240) NOT NULL,
  from_domain varchar(30) NOT NULL,
  to_domain varchar(30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_execution_binding_tenant_artifact_unique
    UNIQUE (
      tenant_id,
      artifact_id
    )
);


CREATE INDEX IF NOT EXISTS
  marketing_execution_binding_tenant_workflow_idx
ON marketing_execution_workflow_bindings (
  tenant_id,
  workflow_id
);


ALTER TABLE
  marketing_execution_artifacts
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
  marketing_execution_approval_bindings
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
  marketing_execution_workflow_bindings
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
  marketing_execution_artifacts_tenant_policy
ON marketing_execution_artifacts;

CREATE POLICY
  marketing_execution_artifacts_tenant_policy
ON marketing_execution_artifacts
USING (
  tenant_id =
    NULLIF(
      current_setting(
        'app.tenant_id',
        true
      ),
      ''
    )::uuid
)
WITH CHECK (
  tenant_id =
    NULLIF(
      current_setting(
        'app.tenant_id',
        true
      ),
      ''
    )::uuid
);


DROP POLICY IF EXISTS
  marketing_execution_approval_tenant_policy
ON marketing_execution_approval_bindings;

CREATE POLICY
  marketing_execution_approval_tenant_policy
ON marketing_execution_approval_bindings
USING (
  tenant_id =
    NULLIF(
      current_setting(
        'app.tenant_id',
        true
      ),
      ''
    )::uuid
)
WITH CHECK (
  tenant_id =
    NULLIF(
      current_setting(
        'app.tenant_id',
        true
      ),
      ''
    )::uuid
);


DROP POLICY IF EXISTS
  marketing_execution_workflow_tenant_policy
ON marketing_execution_workflow_bindings;

CREATE POLICY
  marketing_execution_workflow_tenant_policy
ON marketing_execution_workflow_bindings
USING (
  tenant_id =
    NULLIF(
      current_setting(
        'app.tenant_id',
        true
      ),
      ''
    )::uuid
)
WITH CHECK (
  tenant_id =
    NULLIF(
      current_setting(
        'app.tenant_id',
        true
      ),
      ''
    )::uuid
);
