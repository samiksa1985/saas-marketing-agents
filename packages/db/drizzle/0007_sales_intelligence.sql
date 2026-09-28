DO $$ BEGIN
  CREATE TYPE "lead_score_temperature" AS ENUM ('HOT', 'WARM', 'COLD');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sales_forecast_period" AS ENUM ('WEEK', 'MONTH', 'QUARTER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "proposal_artifact_status" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "lead_score_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "lead_id" uuid NOT NULL,
  "score" integer NOT NULL,
  "temperature" "lead_score_temperature" NOT NULL,
  "fit" integer NOT NULL,
  "intent" integer NOT NULL,
  "engagement" integer NOT NULL,
  "timing" integer NOT NULL,
  "factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "model" varchar(120) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "lead_score_snapshots_tenant_lead_idx"
ON "lead_score_snapshots" ("tenant_id", "lead_id", "created_at");

CREATE INDEX IF NOT EXISTS "lead_score_snapshots_tenant_score_idx"
ON "lead_score_snapshots" ("tenant_id", "score");

CREATE TABLE IF NOT EXISTS "sales_forecast_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "period" "sales_forecast_period" NOT NULL,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "opportunity_count" integer NOT NULL,
  "pipeline_amount" real NOT NULL,
  "weighted_amount" real NOT NULL,
  "win_probability" integer NOT NULL,
  "confidence" integer NOT NULL,
  "opportunity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sales_forecast_snapshots_tenant_period_idx"
ON "sales_forecast_snapshots"
("tenant_id", "period", "period_start", "period_end");

CREATE INDEX IF NOT EXISTS "sales_forecast_snapshots_tenant_created_idx"
ON "sales_forecast_snapshots" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "proposal_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "opportunity_id" uuid NOT NULL,
  "title" text NOT NULL,
  "amount" real,
  "currency" varchar(3),
  "status" "proposal_artifact_status" DEFAULT 'DRAFT' NOT NULL,
  "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "approval_id" uuid,
  "workflow_id" uuid REFERENCES "workflows"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "proposal_artifacts_tenant_opportunity_idx"
ON "proposal_artifacts" ("tenant_id", "opportunity_id");

CREATE INDEX IF NOT EXISTS "proposal_artifacts_tenant_status_idx"
ON "proposal_artifacts" ("tenant_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "proposal_artifacts_approval_idx"
ON "proposal_artifacts" ("tenant_id", "approval_id");

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'lead_score_snapshots',
    'sales_forecast_snapshots',
    'proposal_artifacts'
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
