-- Forward-only reconciliation for databases that recorded historical files
-- 0006, 0008, 0012, 0013, 0015 or 0016 before their source corrections.
-- Do not run this file ad hoc: use the preflight and rollback plan in
-- docs/merge/MIGRATION_READINESS_REPORT.md. No data conversion is attempted.

BEGIN;

-- A deterministic CFO forecast is distinct from financial scenario snapshots.
CREATE TABLE IF NOT EXISTS financial_forecast_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id text,
  period sales_forecast_period NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  actual_revenue jsonb NOT NULL,
  pipeline_amount jsonb NOT NULL,
  weighted_pipeline_amount jsonb NOT NULL,
  forecast_revenue jsonb NOT NULL,
  opportunity_count integer NOT NULL CHECK (opportunity_count >= 0),
  stage_summaries jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_forecast_tenant_period_idx
  ON financial_forecast_snapshots (tenant_id, period, period_start, period_end);
CREATE INDEX IF NOT EXISTS financial_forecast_tenant_created_idx
  ON financial_forecast_snapshots (tenant_id, created_at);

-- Recreate the missing tenant policies with a transaction-local tenant setting.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'knowledge_documents', 'knowledge_document_chunks',
    'knowledge_document_citations',
    'marketing_experiments', 'marketing_experiment_variants',
    'marketing_attribution_snapshots', 'financial_forecast_snapshots'
  ] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I_tenant_policy ON %I', table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', table_name, table_name);
      EXECUTE format(
        'CREATE POLICY %I_tenant_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        table_name, table_name
      );
    END IF;
  END LOOP;
END $$;

-- Historical UUID-default corrections are idempotent and do not rewrite rows.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'company_intelligence_profiles', 'marketing_icp_profiles',
    'marketing_accounts', 'icp_assessment_snapshots'
  ] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', table_name);
    END IF;
  END LOOP;
END $$;

-- Tenant-aware foreign keys added only after the deployment preflight proves
-- there are no orphans. NOT VALID avoids a long initial validation lock; the
-- deployment validates each named constraint after the recorded validation SQL.
DO $$
BEGIN
  IF to_regclass('icp_assessment_snapshots') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'icp_assessment_account_fk') THEN
    ALTER TABLE icp_assessment_snapshots
      ADD CONSTRAINT icp_assessment_account_fk
      FOREIGN KEY (account_id) REFERENCES marketing_accounts(id) NOT VALID;
  END IF;
  IF to_regclass('icp_assessment_snapshots') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'icp_assessment_icp_fk') THEN
    ALTER TABLE icp_assessment_snapshots
      ADD CONSTRAINT icp_assessment_icp_fk
      FOREIGN KEY (icp_id) REFERENCES marketing_icp_profiles(id) NOT VALID;
  END IF;
END $$;

COMMIT;

-- Deliberately excluded: deployed billing real-valued money columns. Their
-- conversion needs a signed data mapping, reconciliation totals, and an
-- application maintenance window; see MIGRATION_READINESS_REPORT.md.
