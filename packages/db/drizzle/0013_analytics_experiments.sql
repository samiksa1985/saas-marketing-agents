DO $$
BEGIN
  CREATE TYPE marketing_experiment_status AS ENUM (
    'planned',
    'running',
    'won',
    'lost',
    'inconclusive'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE marketing_attribution_model AS ENUM (
    'FIRST_TOUCH',
    'LAST_TOUCH',
    'LINEAR',
    'TIME_DECAY',
    'POSITION_BASED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS marketing_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  campaign_id uuid,
  content_id uuid,
  name varchar(240) NOT NULL,
  hypothesis text NOT NULL,
  metric varchar(120) NOT NULL,
  status marketing_experiment_status NOT NULL DEFAULT 'planned',
  winning_variant_id uuid,
  evaluation jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_experiment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  experiment_id uuid NOT NULL REFERENCES marketing_experiments(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_size integer,
  metric_value real,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_attribution_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  source_entity_id uuid NOT NULL,
  revenue_outcome_id uuid REFERENCES marketing_outcome_events(id) ON DELETE SET NULL,
  model marketing_attribution_model NOT NULL,
  total_amount real NOT NULL,
  currency varchar(12),
  allocations jsonb NOT NULL,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_experiments_tenant_status_idx
  ON marketing_experiments(tenant_id,status);

CREATE INDEX IF NOT EXISTS marketing_experiments_tenant_updated_idx
  ON marketing_experiments(tenant_id,updated_at);

CREATE INDEX IF NOT EXISTS marketing_experiment_variants_tenant_experiment_idx
  ON marketing_experiment_variants(tenant_id,experiment_id);

CREATE INDEX IF NOT EXISTS marketing_attribution_tenant_source_idx
  ON marketing_attribution_snapshots(tenant_id,source_entity_id);

CREATE INDEX IF NOT EXISTS marketing_attribution_tenant_calculated_idx
  ON marketing_attribution_snapshots(tenant_id,calculated_at);

ALTER TABLE marketing_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_attribution_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'marketing_experiments',
    'marketing_experiment_variants',
    'marketing_attribution_snapshots'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I_tenant_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
  END LOOP;
END $$;
