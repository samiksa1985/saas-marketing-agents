CREATE TABLE IF NOT EXISTS "market_intelligence_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "research_question" text NOT NULL,
  "market_summary" text NOT NULL,
  "customer_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "market_competitor_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "snapshot_id" uuid NOT NULL REFERENCES "market_intelligence_snapshots"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "website" text,
  "category" text,
  "positioning" text,
  "products" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "differentiators" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "market_trend_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "snapshot_id" uuid NOT NULL REFERENCES "market_intelligence_snapshots"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "direction" text NOT NULL,
  "relevance" integer NOT NULL,
  "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "market_opportunity_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "snapshot_id" uuid NOT NULL REFERENCES "market_intelligence_snapshots"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "type" text NOT NULL,
  "impact" text NOT NULL,
  "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "market_threat_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "snapshot_id" uuid NOT NULL REFERENCES "market_intelligence_snapshots"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "type" text NOT NULL,
  "severity" text NOT NULL,
  "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "market_evidence_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "snapshot_id" uuid NOT NULL REFERENCES "market_intelligence_snapshots"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "claim" text NOT NULL,
  "source_ref" text NOT NULL,
  "source_date" timestamptz,
  "confidence" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "market_intelligence_tenant_created_idx"
ON "market_intelligence_snapshots" ("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "market_competitors_tenant_snapshot_idx"
ON "market_competitor_profiles" ("tenant_id", "snapshot_id");

CREATE INDEX IF NOT EXISTS "market_trends_tenant_snapshot_idx"
ON "market_trend_snapshots" ("tenant_id", "snapshot_id");

CREATE INDEX IF NOT EXISTS "market_opportunities_tenant_snapshot_idx"
ON "market_opportunity_snapshots" ("tenant_id", "snapshot_id");

CREATE INDEX IF NOT EXISTS "market_threats_tenant_snapshot_idx"
ON "market_threat_snapshots" ("tenant_id", "snapshot_id");

CREATE INDEX IF NOT EXISTS "market_evidence_tenant_snapshot_idx"
ON "market_evidence_records" ("tenant_id", "snapshot_id");

CREATE INDEX IF NOT EXISTS "market_evidence_source_idx"
ON "market_evidence_records" ("tenant_id", "source_ref");

ALTER TABLE "market_intelligence_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_competitor_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_trend_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_opportunity_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_threat_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_evidence_records" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_intelligence_tenant_policy" ON "market_intelligence_snapshots";
CREATE POLICY "market_intelligence_tenant_policy"
ON "market_intelligence_snapshots"
USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS "market_competitor_tenant_policy" ON "market_competitor_profiles";
CREATE POLICY "market_competitor_tenant_policy"
ON "market_competitor_profiles"
USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS "market_trend_tenant_policy" ON "market_trend_snapshots";
CREATE POLICY "market_trend_tenant_policy"
ON "market_trend_snapshots"
USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS "market_opportunity_tenant_policy" ON "market_opportunity_snapshots";
CREATE POLICY "market_opportunity_tenant_policy"
ON "market_opportunity_snapshots"
USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS "market_threat_tenant_policy" ON "market_threat_snapshots";
CREATE POLICY "market_threat_tenant_policy"
ON "market_threat_snapshots"
USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS "market_evidence_tenant_policy" ON "market_evidence_records";
CREATE POLICY "market_evidence_tenant_policy"
ON "market_evidence_records"
USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
