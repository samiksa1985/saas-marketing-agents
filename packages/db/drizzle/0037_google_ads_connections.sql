-- WS-PROD-09: governed Google Ads connection persistence.
--
-- Connections and account mappings are tenant-scoped with RLS. Refresh-token
-- material is NEVER stored: credential_ref is an opaque reference to the
-- approved external secret store. If no approved secret store reference is
-- available, connection creation fails closed in the service layer.

CREATE TABLE IF NOT EXISTS google_ads_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider varchar(32) NOT NULL DEFAULT 'GOOGLE_ADS',
  status varchar(24) NOT NULL DEFAULT 'PENDING',
  principal_ref varchar(255),
  credential_ref varchar(512),
  scopes text[] NOT NULL DEFAULT '{}',
  oauth_state_hash char(64),
  oauth_state_expires_at timestamptz,
  connected_at timestamptz,
  verified_at timestamptz,
  verification_request_id varchar(128),
  disconnected_at timestamptz,
  idempotency_key varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_ads_connection_status_check
    CHECK (status IN ('PENDING', 'CONNECTED', 'VERIFIED', 'DISCONNECTED', 'FAILED')),
  CONSTRAINT google_ads_connection_provider_check CHECK (provider = 'GOOGLE_ADS'),
  CONSTRAINT google_ads_connection_tenant_key_uidx UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS google_ads_connections_tenant_status_idx
  ON google_ads_connections (tenant_id, status);

ALTER TABLE google_ads_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS google_ads_connections_tenant_policy ON google_ads_connections;
CREATE POLICY google_ads_connections_tenant_policy
  ON google_ads_connections
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS google_ads_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  connection_id uuid NOT NULL REFERENCES google_ads_connections(id) ON DELETE CASCADE,
  customer_id varchar(32) NOT NULL,
  login_customer_id varchar(32),
  descriptive_name varchar(255),
  currency_code varchar(3),
  is_manager boolean NOT NULL DEFAULT false,
  accessible boolean NOT NULL DEFAULT true,
  selected boolean NOT NULL DEFAULT false,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_ads_account_mapping_connection_key_uidx
    UNIQUE (tenant_id, connection_id, customer_id)
);

CREATE INDEX IF NOT EXISTS google_ads_account_mappings_tenant_idx
  ON google_ads_account_mappings (tenant_id, connection_id);

ALTER TABLE google_ads_account_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS google_ads_account_mappings_tenant_policy ON google_ads_account_mappings;
CREATE POLICY google_ads_account_mappings_tenant_policy
  ON google_ads_account_mappings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
