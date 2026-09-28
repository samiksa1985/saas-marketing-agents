-- Forward repair for the historical tenant_admin seed omission.  The role is
-- global catalog data; tenant membership and all tenant-scoped access remain
-- governed by tenant_members and their existing RLS policies.
--
-- Do not update an existing role: its identity and any already-recorded
-- metadata are authoritative.  The unique role name makes this idempotent.
INSERT INTO roles (name)
VALUES ('tenant_admin')
ON CONFLICT (name) DO NOTHING;

-- 0017 explicitly assigned this canonical permission to tenant_admin but did
-- not seed the permission row.  Insert no descriptive metadata so an existing
-- canonical row is never overwritten.
INSERT INTO permissions (name)
VALUES ('audit:read')
ON CONFLICT (name) DO NOTHING;

-- Reapply only the tenant_admin mappings already declared by 0017.  The joins
-- intentionally do not create any other permissions, and the composite key
-- makes a repeated migration lifecycle safe.
WITH canonical_tenant_admin_permissions(permission_name) AS (
  VALUES
    ('organization:read'),
    ('organization:manage'),
    ('member:read'),
    ('member:manage'),
    ('role:read'),
    ('role:manage'),
    ('marketing:admin'),
    ('sales:admin'),
    ('finance:admin'),
    ('customer_success:admin'),
    ('automation:admin'),
    ('ai_agent:admin'),
    ('ai_prompt:admin'),
    ('ai_model:admin'),
    ('integration:admin'),
    ('billing:admin'),
    ('entitlement:admin'),
    ('audit:read'),
    ('feature_flag:read'),
    ('feature_flag:manage'),
    ('data_export:request'),
    ('data_export:read'),
    ('data_export:manage'),
    ('data_deletion:request'),
    ('data_deletion:read'),
    ('data_deletion:manage'),
    ('retention_policy:read'),
    ('retention_policy:manage'),
    ('security_policy:read'),
    ('security_policy:manage'),
    ('system_health:read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM canonical_tenant_admin_permissions
JOIN roles ON roles.name = 'tenant_admin'
JOIN permissions ON permissions.name = canonical_tenant_admin_permissions.permission_name
ON CONFLICT DO NOTHING;
