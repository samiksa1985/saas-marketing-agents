-- Admin & Governance extends the canonical control plane.  It deliberately
-- reuses audit_events for immutable governance history rather than creating a
-- competing audit log.

INSERT INTO roles (name, description)
VALUES
  ('marketing_manager', 'Manages marketing administration within a tenant.'),
  ('sales_manager', 'Manages sales administration within a tenant.'),
  ('finance_manager', 'Manages finance administration within a tenant.'),
  ('customer_success_manager', 'Manages customer-success administration within a tenant.'),
  ('operations_manager', 'Manages operational administration within a tenant.'),
  ('client_admin', 'Tenant client administrator with organization administration rights.'),
  ('client_user', 'Tenant client user with explicitly granted operational access.'),
  ('viewer', 'Read-only tenant participant.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, description)
VALUES
  ('organization:read', 'Read organization governance configuration.'),
  ('organization:manage', 'Manage organization governance configuration.'),
  ('member:read', 'Read tenant members.'),
  ('member:manage', 'Manage tenant members.'),
  ('role:read', 'Read canonical roles and permission assignments.'),
  ('role:manage', 'Manage role assignments.'),
  ('marketing:admin', 'Administer marketing operations.'),
  ('sales:admin', 'Administer sales operations.'),
  ('finance:admin', 'Administer finance operations.'),
  ('customer_success:admin', 'Administer customer-success operations.'),
  ('automation:admin', 'Administer automations.'),
  ('ai_agent:admin', 'Administer AI agents.'),
  ('ai_prompt:admin', 'Administer AI prompts.'),
  ('ai_model:admin', 'Administer AI model configuration.'),
  ('integration:admin', 'Administer integrations.'),
  ('billing:admin', 'Administer billing configuration.'),
  ('entitlement:admin', 'Administer feature entitlements.'),
  ('feature_flag:read', 'Read governance feature flags.'),
  ('feature_flag:manage', 'Manage governance feature flags.'),
  ('data_export:request', 'Request tenant data exports.'),
  ('data_export:read', 'Read tenant data export requests.'),
  ('data_export:manage', 'Manage tenant data export requests.'),
  ('data_deletion:request', 'Request tenant data deletion.'),
  ('data_deletion:read', 'Read tenant data deletion requests.'),
  ('data_deletion:manage', 'Manage approval-gated tenant data deletion requests.'),
  ('retention_policy:read', 'Read tenant data retention policies.'),
  ('retention_policy:manage', 'Manage tenant data retention policies.'),
  ('security_policy:read', 'Read tenant security policies.'),
  ('security_policy:manage', 'Manage tenant security policies.'),
  ('system_health:read', 'Read system health for the tenant.')
ON CONFLICT (name) DO NOTHING;

WITH role_permission_map(role_name, permission_name) AS (
  VALUES
    ('tenant_admin', 'organization:read'),
    ('tenant_admin', 'organization:manage'),
    ('tenant_admin', 'member:read'),
    ('tenant_admin', 'member:manage'),
    ('tenant_admin', 'role:read'),
    ('tenant_admin', 'role:manage'),
    ('tenant_admin', 'marketing:admin'),
    ('tenant_admin', 'sales:admin'),
    ('tenant_admin', 'finance:admin'),
    ('tenant_admin', 'customer_success:admin'),
    ('tenant_admin', 'automation:admin'),
    ('tenant_admin', 'ai_agent:admin'),
    ('tenant_admin', 'ai_prompt:admin'),
    ('tenant_admin', 'ai_model:admin'),
    ('tenant_admin', 'integration:admin'),
    ('tenant_admin', 'billing:admin'),
    ('tenant_admin', 'entitlement:admin'),
    ('tenant_admin', 'audit:read'),
    ('tenant_admin', 'feature_flag:read'),
    ('tenant_admin', 'feature_flag:manage'),
    ('tenant_admin', 'data_export:request'),
    ('tenant_admin', 'data_export:read'),
    ('tenant_admin', 'data_export:manage'),
    ('tenant_admin', 'data_deletion:request'),
    ('tenant_admin', 'data_deletion:read'),
    ('tenant_admin', 'data_deletion:manage'),
    ('tenant_admin', 'retention_policy:read'),
    ('tenant_admin', 'retention_policy:manage'),
    ('tenant_admin', 'security_policy:read'),
    ('tenant_admin', 'security_policy:manage'),
    ('tenant_admin', 'system_health:read'),
    ('marketing_manager', 'marketing:admin'),
    ('sales_manager', 'sales:admin'),
    ('finance_manager', 'finance:admin'),
    ('customer_success_manager', 'customer_success:admin'),
    ('operations_manager', 'automation:admin'),
    ('operations_manager', 'integration:admin'),
    ('operations_manager', 'system_health:read'),
    ('client_admin', 'organization:read'),
    ('client_admin', 'member:read'),
    ('client_admin', 'member:manage'),
    ('client_admin', 'data_export:request'),
    ('client_admin', 'data_export:read'),
    ('client_admin', 'data_deletion:request'),
    ('client_admin', 'data_deletion:read'),
    ('client_user', 'tenant:read'),
    ('viewer', 'tenant:read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM role_permission_map
JOIN roles ON roles.name = role_permission_map.role_name
JOIN permissions ON permissions.name = role_permission_map.permission_name
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS governance_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key varchar(180) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS governance_data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  resource_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(40) NOT NULL,
  approval_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance_data_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  resource_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  selectors jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  status varchar(40) NOT NULL,
  approval_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  resource_type varchar(180) NOT NULL,
  retention_days integer NOT NULL CHECK (retention_days >= 0),
  disposition varchar(40) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, resource_type)
);

CREATE TABLE IF NOT EXISTS governance_organization_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key varchar(180) NOT NULL,
  value jsonb NOT NULL,
  reason text,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS governance_feature_flags_tenant_enabled_idx
  ON governance_feature_flags (tenant_id, enabled);
CREATE INDEX IF NOT EXISTS governance_data_export_requests_tenant_status_idx
  ON governance_data_export_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS governance_data_export_requests_tenant_created_idx
  ON governance_data_export_requests (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS governance_data_deletion_requests_tenant_status_idx
  ON governance_data_deletion_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS governance_data_deletion_requests_tenant_created_idx
  ON governance_data_deletion_requests (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS governance_retention_policies_tenant_enabled_idx
  ON governance_retention_policies (tenant_id, enabled);
CREATE INDEX IF NOT EXISTS governance_organization_overrides_tenant_active_idx
  ON governance_organization_overrides (tenant_id, active);

-- Canonical audit_events is already tenant scoped and RLS-enabled by 0001.
ALTER TABLE governance_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_data_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_organization_overrides ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'governance_feature_flags',
    'governance_data_export_requests',
    'governance_data_deletion_requests',
    'governance_retention_policies',
    'governance_organization_overrides'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_policy ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
  END LOOP;
END $$;
