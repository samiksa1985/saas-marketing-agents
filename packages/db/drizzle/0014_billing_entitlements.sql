DO $$
BEGIN
  CREATE TYPE billing_subscription_status AS ENUM (
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'SUSPENDED',
    'CANCELLED',
    'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE billing_cycle AS ENUM (
    'MONTHLY',
    'YEARLY',
    'CUSTOM'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE billing_invoice_status AS ENUM (
    'DRAFT',
    'OPEN',
    'PAID',
    'VOID',
    'UNCOLLECTIBLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE billing_payment_status AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED',
    'REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  description text,
  currency varchar(12) NOT NULL,
  price_monthly_minor integer,
  price_yearly_minor integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_plan_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES billing_plans(id) ON DELETE CASCADE,
  key varchar(180) NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id,key)
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  plan_id uuid NOT NULL REFERENCES billing_plans(id),
  status billing_subscription_status NOT NULL,
  billing_cycle billing_cycle NOT NULL,
  started_at timestamptz NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  provider varchar(80),
  provider_subscription_id varchar(240),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_organization_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key varchar(180) NOT NULL,
  value jsonb NOT NULL,
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,key)
);

CREATE TABLE IF NOT EXISTS billing_usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key varchar(180) NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 0,
  "limit" integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(
    tenant_id,
    key,
    period_start,
    period_end
  )
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  subscription_id uuid REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
  external_invoice_id varchar(240),
  currency varchar(12) NOT NULL,
  amount_due_minor integer NOT NULL,
  amount_paid_minor integer NOT NULL DEFAULT 0,
  status billing_invoice_status NOT NULL,
  issued_at timestamptz NOT NULL,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  invoice_id uuid REFERENCES billing_invoices(id) ON DELETE SET NULL,
  external_payment_id varchar(240),
  provider varchar(80),
  currency varchar(12) NOT NULL,
  amount_minor integer NOT NULL,
  status billing_payment_status NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_tenant_status_idx
  ON billing_subscriptions(tenant_id,status);

CREATE INDEX IF NOT EXISTS billing_subscriptions_tenant_period_idx
  ON billing_subscriptions(tenant_id,current_period_end);

CREATE INDEX IF NOT EXISTS billing_invoices_tenant_status_idx
  ON billing_invoices(tenant_id,status);

CREATE INDEX IF NOT EXISTS billing_payments_tenant_status_idx
  ON billing_payments(tenant_id,status);

ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_organization_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "billing_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "key" varchar(180) NOT NULL,
  "amount" integer NOT NULL,
  "idempotency_key" varchar(255) NOT NULL,
  "source" varchar(100) NOT NULL,
  "agent_run_id" varchar(255),
  "workflow_run_id" varchar(255),
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS
"billing_usage_events_tenant_idempotency_uidx"
ON "billing_usage_events"
("tenant_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS
"billing_usage_events_tenant_key_period_idx"
ON "billing_usage_events"
("tenant_id", "key", "period_start", "period_end");

ALTER TABLE "billing_usage_events"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"billing_usage_events_tenant_policy"
ON "billing_usage_events";

CREATE POLICY
"billing_usage_events_tenant_policy"
ON "billing_usage_events"
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
ALTER TABLE "billing_subscriptions"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"billing_subscriptions_tenant_policy"
ON "billing_subscriptions";

CREATE POLICY
"billing_subscriptions_tenant_policy"
ON "billing_subscriptions"
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
ALTER TABLE "billing_organization_entitlements"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"billing_organization_entitlements_tenant_policy"
ON "billing_organization_entitlements";

CREATE POLICY
"billing_organization_entitlements_tenant_policy"
ON "billing_organization_entitlements"
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
ALTER TABLE "billing_usage_counters"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"billing_usage_counters_tenant_policy"
ON "billing_usage_counters";

CREATE POLICY
"billing_usage_counters_tenant_policy"
ON "billing_usage_counters"
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
ALTER TABLE "billing_invoices"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"billing_invoices_tenant_policy"
ON "billing_invoices";

CREATE POLICY
"billing_invoices_tenant_policy"
ON "billing_invoices"
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
ALTER TABLE "billing_payments"
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
"billing_payments_tenant_policy"
ON "billing_payments";

CREATE POLICY
"billing_payments_tenant_policy"
ON "billing_payments"
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
