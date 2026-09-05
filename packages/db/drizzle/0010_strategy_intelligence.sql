DO $$
BEGIN
  CREATE TYPE "marketing_strategy_status" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'SUPERSEDED',
    'ARCHIVED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "marketing_strategies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" text NOT NULL,
  "current_version" integer DEFAULT 1 NOT NULL,
  "status" "marketing_strategy_status" DEFAULT 'DRAFT' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "marketing_strategy_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "strategy_id" uuid NOT NULL REFERENCES "marketing_strategies"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "executive_summary" text NOT NULL,
  "objective_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "icp_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "positioning" text NOT NULL,
  "messaging" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "offers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "campaigns" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "content_pillars" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "roadmap" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "priorities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "approval_id" uuid,
  "status" "marketing_strategy_status" DEFAULT 'DRAFT' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS
"marketing_strategy_versions_strategy_version_uq"
ON "marketing_strategy_versions"
("strategy_id", "version");

CREATE INDEX IF NOT EXISTS
"marketing_strategies_tenant_status_idx"
ON "marketing_strategies"
("tenant_id", "status", "updated_at");

CREATE INDEX IF NOT EXISTS
"marketing_strategy_versions_tenant_strategy_idx"
ON "marketing_strategy_versions"
("tenant_id", "strategy_id", "version");

CREATE INDEX IF NOT EXISTS
"marketing_strategy_versions_status_idx"
ON "marketing_strategy_versions"
("tenant_id", "status", "created_at");

ALTER TABLE "marketing_strategies"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "marketing_strategy_versions"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"marketing_strategies_tenant_policy"
ON "marketing_strategies";

CREATE POLICY
"marketing_strategies_tenant_policy"
ON "marketing_strategies"
USING (
  "tenant_id" =
  NULLIF(
    current_setting(
      'app.tenant_id',
      true
    ),
    ''
  )::uuid
)
WITH CHECK (
  "tenant_id" =
  NULLIF(
    current_setting(
      'app.tenant_id',
      true
    ),
    ''
  )::uuid
);

DROP POLICY IF EXISTS
"marketing_strategy_versions_tenant_policy"
ON "marketing_strategy_versions";

CREATE POLICY
"marketing_strategy_versions_tenant_policy"
ON "marketing_strategy_versions"
USING (
  "tenant_id" =
  NULLIF(
    current_setting(
      'app.tenant_id',
      true
    ),
    ''
  )::uuid
)
WITH CHECK (
  "tenant_id" =
  NULLIF(
    current_setting(
      'app.tenant_id',
      true
    ),
    ''
  )::uuid
);
