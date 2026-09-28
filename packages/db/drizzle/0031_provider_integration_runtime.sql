-- EPIC-14: tenant-scoped provider bindings and sanitized verification evidence.
-- Existing EPIC-05 provider/credential health, outbox, and operational events remain authoritative.
BEGIN;
CREATE TABLE IF NOT EXISTS tenant_provider_bindings (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider varchar(64) NOT NULL,
  environment varchar(16) NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  execution_mode varchar(16) NOT NULL CHECK (execution_mode IN ('DISABLED','MOCK','REAL')),
  configured boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  credential_reference varchar(255),
  idempotency_key varchar(255) NOT NULL,
  adapter_version varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_provider_binding_tenant_provider_environment_uidx UNIQUE (tenant_id, provider, environment),
  CONSTRAINT tenant_provider_binding_tenant_key_uidx UNIQUE (tenant_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS tenant_provider_capabilities (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  binding_id varchar(255) NOT NULL REFERENCES tenant_provider_bindings(id) ON DELETE CASCADE,
  capability varchar(64) NOT NULL,
  operation varchar(32) NOT NULL CHECK (operation IN ('READ_ONLY','INTERNAL_NON_CONSEQUENTIAL','EXTERNAL_CONSEQUENTIAL')),
  supported boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  idempotency_key varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_provider_capability_tenant_key_uidx UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT tenant_provider_capability_tenant_binding_capability_uidx UNIQUE (tenant_id, binding_id, capability)
);
CREATE TABLE IF NOT EXISTS provider_integration_verifications (
  id varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  binding_id varchar(255) NOT NULL REFERENCES tenant_provider_bindings(id) ON DELETE CASCADE,
  capability varchar(64) NOT NULL,
  state varchar(32) NOT NULL CHECK (state IN ('REQUESTED','DISPATCHED','PROVIDER_ACCEPTED','EXECUTED_UNVERIFIED','VERIFIED','FAILED','UNCERTAIN')),
  provider_reference varchar(255),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key varchar(255) NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_integration_verification_tenant_key_uidx UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS tenant_provider_capabilities_tenant_binding_idx ON tenant_provider_capabilities (tenant_id, binding_id);
CREATE INDEX IF NOT EXISTS provider_integration_verifications_tenant_binding_idx ON provider_integration_verifications (tenant_id, binding_id, created_at);
DO $$ DECLARE item text; BEGIN FOREACH item IN ARRAY ARRAY['tenant_provider_bindings','tenant_provider_capabilities','provider_integration_verifications'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', item); EXECUTE format('DROP POLICY IF EXISTS %I ON %I', item || '_tenant_policy', item); EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', item || '_tenant_policy', item); END LOOP; END $$;
COMMIT;
