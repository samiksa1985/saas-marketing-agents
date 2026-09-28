-- Durable backing for the canonical API approval service. This extends the
-- existing approval architecture without changing historical UUID-only
-- approval_requests, whose workflow/artifact ownership differs from Marketing OS.
CREATE TABLE IF NOT EXISTS marketing_os_approval_records (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  artifact_id varchar(255) NOT NULL,
  plan_id varchar(255),
  workflow_id varchar(255),
  execution_binding_id uuid REFERENCES marketing_os_execution_records(id) ON DELETE SET NULL,
  requested_by_user_id varchar(255),
  requested_at timestamptz NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'PENDING',
  decision varchar(32),
  approver_user_id varchar(255),
  decided_at timestamptz,
  expires_at timestamptz,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  policy_reference varchar(255),
  risk_level varchar(64),
  action_summary text,
  creation_idempotency_key varchar(255) NOT NULL,
  decision_idempotency_key varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_os_approval_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  CONSTRAINT marketing_os_approval_decision_check
    CHECK (decision IS NULL OR decision IN ('approved', 'approved_with_conditions', 'rejected', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_os_approval_tenant_creation_idempotency_uidx
  ON marketing_os_approval_records (tenant_id, creation_idempotency_key);
CREATE INDEX IF NOT EXISTS marketing_os_approval_tenant_plan_idx
  ON marketing_os_approval_records (tenant_id, plan_id);
CREATE INDEX IF NOT EXISTS marketing_os_approval_tenant_workflow_idx
  ON marketing_os_approval_records (tenant_id, workflow_id);
CREATE INDEX IF NOT EXISTS marketing_os_approval_tenant_status_idx
  ON marketing_os_approval_records (tenant_id, status);

ALTER TABLE marketing_os_approval_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_os_approval_records_tenant_policy
  ON marketing_os_approval_records;
DROP POLICY IF EXISTS marketing_os_approval_records_tenant_isolation
  ON marketing_os_approval_records;
CREATE POLICY marketing_os_approval_records_tenant_policy
  ON marketing_os_approval_records
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- Embeddings must remain attributable to a model and version.  This allows a
-- tenant's knowledge to be re-embedded deliberately without an in-memory
-- production fallback or an ambiguous vector provenance record.
ALTER TABLE knowledge_document_chunks
  ADD COLUMN IF NOT EXISTS embedding_provider varchar(64),
  ADD COLUMN IF NOT EXISTS embedding_model varchar(255),
  ADD COLUMN IF NOT EXISTS embedding_version varchar(255),
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_embedding_provenance_idx
  ON knowledge_document_chunks (tenant_id, embedding_provider, embedding_model, embedding_version);
--> statement-breakpoint

-- A globally unique document UUID alone does not express tenant ownership to
-- a foreign key. Preserve that invariant in the database for chunk writes.
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_tenant_id_id_uidx UNIQUE (tenant_id, id);
--> statement-breakpoint

ALTER TABLE knowledge_document_chunks
  ADD CONSTRAINT knowledge_document_chunks_tenant_document_fkey
  FOREIGN KEY (tenant_id, document_id)
  REFERENCES knowledge_documents (tenant_id, id)
  ON DELETE CASCADE;
