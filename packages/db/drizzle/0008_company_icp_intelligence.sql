CREATE TABLE IF NOT EXISTS company_intelligence_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  company_name text NOT NULL,
  website text,
  industry text,
  sub_industry text,
  headquarters text,
  geographies jsonb NOT NULL DEFAULT '[]'::jsonb,
  employee_band text,
  revenue_band text,
  business_model text,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  technologies jsonb NOT NULL DEFAULT '[]'::jsonb,
  competitors jsonb NOT NULL DEFAULT '[]'::jsonb,
  customers jsonb NOT NULL DEFAULT '[]'::jsonb,
  pain_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  strategic_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  buying_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_icp_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  industries jsonb NOT NULL DEFAULT '[]'::jsonb,
  company_sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  geographies jsonb NOT NULL DEFAULT '[]'::jsonb,
  buying_triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  pain_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  desired_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  website text,
  industry text,
  geography text,
  employee_band text,
  icp_fit integer,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS icp_assessment_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  account_id uuid NOT NULL,
  icp_id uuid NOT NULL,
  score integer NOT NULL,
  tier text NOT NULL,
  matched_industries jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_geographies jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_pain_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_intelligence_tenant_updated_idx
ON company_intelligence_profiles(tenant_id, updated_at);

CREATE INDEX IF NOT EXISTS marketing_icp_tenant_status_idx
ON marketing_icp_profiles(tenant_id, status);

CREATE INDEX IF NOT EXISTS marketing_accounts_tenant_status_idx
ON marketing_accounts(tenant_id, status);

CREATE INDEX IF NOT EXISTS icp_assessment_tenant_account_idx
ON icp_assessment_snapshots(tenant_id, account_id, created_at);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'company_intelligence_profiles',
    'marketing_icp_profiles',
    'marketing_accounts',
    'icp_assessment_snapshots'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ENABLE ROW LEVEL SECURITY',
      table_name
    );

    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
  END LOOP;
END $$;
