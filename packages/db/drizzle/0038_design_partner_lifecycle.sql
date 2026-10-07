-- WS-PROD-10: controlled design-partner tenant lifecycle.
--
-- Lifecycle requests, per-tenant lifecycle state, bounded operational limits,
-- and transition audit are tenant-scoped with canonical RLS. Tenants gain a
-- lifecycle column constrained to the explicit state machine. No secrets,
-- provider credentials, or customer data are stored here.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lifecycle varchar(24) NOT NULL DEFAULT 'ACTIVE_CONTROLLED';

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_lifecycle_check;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_lifecycle_check
  CHECK (lifecycle IN (
    'REQUESTED', 'QUALIFIED', 'APPROVED', 'PROVISIONING', 'PROVISIONED',
    'VERIFYING', 'READY', 'ACTIVE_CONTROLLED', 'SUSPENDED', 'OFFBOARDING', 'OFFBOARDED'
  ));

CREATE TABLE IF NOT EXISTS design_partner_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  status varchar(24) NOT NULL DEFAULT 'REQUESTED',
  slug varchar(80) NOT NULL,
  display_name varchar(255) NOT NULL,
  design_partner_ref varchar(255) NOT NULL,
  admin_subject varchar(512) NOT NULL,
  admin_display_name varchar(255) NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_connection boolean NOT NULL DEFAULT false,
  provider_read_only boolean NOT NULL DEFAULT false,
  provider_validate_only boolean NOT NULL DEFAULT false,
  provider_live_mutation boolean NOT NULL DEFAULT false,
  max_active_workflows integer NOT NULL DEFAULT 10,
  max_members integer NOT NULL DEFAULT 25,
  max_provider_connections integer NOT NULL DEFAULT 2,
  dispatch_concurrency integer NOT NULL DEFAULT 2,
  requested_by varchar(255) NOT NULL,
  approval_id varchar(255),
  approved_at timestamptz,
  expires_at timestamptz,
  idempotency_key varchar(255) NOT NULL,
  request_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_partner_request_status_check
    CHECK (status IN ('REQUESTED', 'QUALIFIED', 'APPROVED', 'PROVISIONING', 'PROVISIONED', 'VERIFYING', 'READY', 'ACTIVE_CONTROLLED', 'SUSPENDED', 'OFFBOARDING', 'OFFBOARDED', 'REJECTED')),
  CONSTRAINT design_partner_request_live_mutation_off CHECK (provider_live_mutation = false),
  CONSTRAINT design_partner_request_limits_check
    CHECK (max_active_workflows >= 0 AND max_active_workflows <= 1000
       AND max_members >= 1 AND max_members <= 1000
       AND max_provider_connections >= 0 AND max_provider_connections <= 50
       AND dispatch_concurrency >= 1 AND dispatch_concurrency <= 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS design_partner_request_idempotency_uidx
  ON design_partner_requests (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS design_partner_request_slug_uidx
  ON design_partner_requests (slug);
CREATE INDEX IF NOT EXISTS design_partner_request_status_idx
  ON design_partner_requests (status);

ALTER TABLE design_partner_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS design_partner_requests_tenant_policy ON design_partner_requests;
CREATE POLICY design_partner_requests_tenant_policy
  ON design_partner_requests
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS design_partner_limits (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  max_active_workflows integer NOT NULL,
  max_members integer NOT NULL,
  max_provider_connections integer NOT NULL,
  dispatch_concurrency integer NOT NULL,
  provider_connection_allowed boolean NOT NULL DEFAULT false,
  provider_read_only_allowed boolean NOT NULL DEFAULT false,
  provider_validate_only_allowed boolean NOT NULL DEFAULT false,
  provider_live_mutation_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_partner_limits_live_mutation_off CHECK (provider_live_mutation_allowed = false)
);

ALTER TABLE design_partner_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS design_partner_limits_tenant_policy ON design_partner_limits;
CREATE POLICY design_partner_limits_tenant_policy
  ON design_partner_limits
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS design_partner_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  request_id uuid REFERENCES design_partner_requests(id),
  from_lifecycle varchar(24),
  to_lifecycle varchar(24) NOT NULL,
  actor varchar(255) NOT NULL,
  reason text,
  approval_id varchar(255),
  idempotency_key varchar(255) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_partner_lifecycle_event_idempotency_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS design_partner_lifecycle_events_tenant_idx
  ON design_partner_lifecycle_events (tenant_id, occurred_at);

ALTER TABLE design_partner_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS design_partner_lifecycle_events_tenant_policy ON design_partner_lifecycle_events;
CREATE POLICY design_partner_lifecycle_events_tenant_policy
  ON design_partner_lifecycle_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Platform provisioning permission: tenant-scoped roles never receive it.
INSERT INTO permissions (name) VALUES ('platform:provision') ON CONFLICT (name) DO NOTHING;
