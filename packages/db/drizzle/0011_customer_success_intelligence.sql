DO $$
BEGIN
  CREATE TYPE "customer_health_status" AS ENUM (
    'HEALTHY',
    'WATCH',
    'AT_RISK',
    'CRITICAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "customer_churn_risk" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "customer_health_assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "customer_id" text NOT NULL,
  "account_id" text,
  "score" integer NOT NULL,
  "status" "customer_health_status" NOT NULL,
  "churn_risk" "customer_churn_risk" NOT NULL,
  "causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "model" text NOT NULL,
  "assessed_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customer_renewal_recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "customer_id" text NOT NULL,
  "account_id" text,
  "health_assessment_id" text NOT NULL,
  "days_to_renewal" integer,
  "recommendation" text NOT NULL,
  "rationale" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customer_expansion_assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "customer_id" text NOT NULL,
  "account_id" text,
  "health_assessment_id" text NOT NULL,
  "eligible" boolean NOT NULL,
  "score" integer NOT NULL,
  "rationale" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "recommended_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS
"customer_health_tenant_customer_idx"
ON "customer_health_assessments"
("tenant_id", "customer_id", "assessed_at");

CREATE INDEX IF NOT EXISTS
"customer_renewal_tenant_customer_idx"
ON "customer_renewal_recommendations"
("tenant_id", "customer_id", "created_at");

CREATE INDEX IF NOT EXISTS
"customer_expansion_tenant_customer_idx"
ON "customer_expansion_assessments"
("tenant_id", "customer_id", "created_at");

ALTER TABLE "customer_health_assessments"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "customer_renewal_recommendations"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "customer_expansion_assessments"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"customer_health_tenant_policy"
ON "customer_health_assessments";

CREATE POLICY
"customer_health_tenant_policy"
ON "customer_health_assessments"
USING (
  "tenant_id" =
  NULLIF(
    current_setting('app.tenant_id', true),
    ''
  )::uuid
)
WITH CHECK (
  "tenant_id" =
  NULLIF(
    current_setting('app.tenant_id', true),
    ''
  )::uuid
);

DROP POLICY IF EXISTS
"customer_renewal_tenant_policy"
ON "customer_renewal_recommendations";

CREATE POLICY
"customer_renewal_tenant_policy"
ON "customer_renewal_recommendations"
USING (
  "tenant_id" =
  NULLIF(
    current_setting('app.tenant_id', true),
    ''
  )::uuid
)
WITH CHECK (
  "tenant_id" =
  NULLIF(
    current_setting('app.tenant_id', true),
    ''
  )::uuid
);

DROP POLICY IF EXISTS
"customer_expansion_tenant_policy"
ON "customer_expansion_assessments";

CREATE POLICY
"customer_expansion_tenant_policy"
ON "customer_expansion_assessments"
USING (
  "tenant_id" =
  NULLIF(
    current_setting('app.tenant_id', true),
    ''
  )::uuid
)
WITH CHECK (
  "tenant_id" =
  NULLIF(
    current_setting('app.tenant_id', true),
    ''
  )::uuid
);
