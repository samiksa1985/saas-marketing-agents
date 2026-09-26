import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../drizzle/0032_tenant_admin_rbac_seed.sql', import.meta.url)),
  'utf8',
);
const governanceSource = readFileSync(
  fileURLToPath(new URL('../drizzle/0017_admin_governance.sql', import.meta.url)),
  'utf8',
);
const journal = JSON.parse(
  readFileSync(fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url)), 'utf8'),
) as { entries: Array<{ idx: number; when: number; tag: string }> };

const expectedPermissions = [
  'organization:read', 'organization:manage', 'member:read', 'member:manage',
  'role:read', 'role:manage', 'marketing:admin', 'sales:admin', 'finance:admin',
  'customer_success:admin', 'automation:admin', 'ai_agent:admin', 'ai_prompt:admin',
  'ai_model:admin', 'integration:admin', 'billing:admin', 'entitlement:admin',
  'audit:read', 'feature_flag:read', 'feature_flag:manage', 'data_export:request',
  'data_export:read', 'data_export:manage', 'data_deletion:request',
  'data_deletion:read', 'data_deletion:manage', 'retention_policy:read',
  'retention_policy:manage', 'security_policy:read', 'security_policy:manage',
  'system_health:read',
];

function mappedPermissions(): string[] {
  const block = source.match(/WITH canonical_tenant_admin_permissions\(permission_name\) AS \(\s*VALUES([\s\S]*?)\)\s*INSERT INTO role_permissions/);
  const values = block?.[1];
  if (!values) throw new Error('0032 must have an explicit, bounded tenant_admin mapping');
  return [...values.matchAll(/\('([^']+)'\)/g)].map((match) => {
    const permission = match[1];
    if (!permission) throw new Error('0032 contains an invalid permission mapping');
    return permission;
  });
}

function documented0017Permissions(): string[] {
  const block = governanceSource.match(/WITH role_permission_map\(role_name, permission_name\) AS \(\s*VALUES([\s\S]*?)\)\s*INSERT INTO role_permissions/);
  const values = block?.[1];
  if (!values) throw new Error('0017 has no canonical role permission mapping');
  return [...values.matchAll(/\('tenant_admin', '([^']+)'\)/g)].map((match) => {
    const permission = match[1];
    if (!permission) throw new Error('0017 contains an invalid tenant_admin mapping');
    return permission;
  });
}

test('fresh migration path adds exactly one idempotent canonical tenant_admin role contract', () => {
  assert.match(source, /INSERT INTO roles \(name\)\s+VALUES \('tenant_admin'\)\s+ON CONFLICT \(name\) DO NOTHING;/);
  assert.equal(journal.entries.at(-1)?.tag, '0032_tenant_admin_rbac_seed');
  assert.equal(journal.entries.at(-1)?.idx, 32);
  assert.equal(journal.entries.at(-1)?.when, 1788629864187);
});

test('upgrade and existing-role paths preserve tenant_admin identity and metadata', () => {
  assert.match(source, /ON CONFLICT \(name\) DO NOTHING;/);
  assert.doesNotMatch(source, /ON CONFLICT \(name\) DO UPDATE|UPDATE roles|DELETE FROM roles/i);
  assert.doesNotMatch(source, /description\s*=/i);
});

test('tenant_admin receives exactly the documented 0017 governance mappings', () => {
  assert.deepEqual(mappedPermissions(), expectedPermissions);
  assert.deepEqual(mappedPermissions(), documented0017Permissions());
  assert.match(source, /INSERT INTO permissions \(name\)\s+VALUES \('audit:read'\)\s+ON CONFLICT \(name\) DO NOTHING;/);
  assert.match(source, /INSERT INTO role_permissions \(role_id, permission_id\)[\s\S]*ON CONFLICT DO NOTHING;/);
});

test('no later journaled migration introduces another RBAC seed source', () => {
  for (const entry of journal.entries.filter((entry) => entry.idx >= 18 && entry.idx <= 31)) {
    const laterSource = readFileSync(
      fileURLToPath(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url)),
      'utf8',
    );
    assert.doesNotMatch(laterSource, /INSERT INTO (roles|permissions|role_permissions)/i);
  }
});

test('forward mapping does not introduce execution bypasses, wildcard grants, or RLS changes', () => {
  for (const unsupported of ['workflow:execute', 'approval:decide', 'tenant:manage', '*']) {
    assert.ok(!mappedPermissions().includes(unsupported), `${unsupported} must not be granted by 0032`);
  }
  assert.doesNotMatch(source, /ALTER TABLE|CREATE POLICY|DROP POLICY|GRANT\s+/i);
});

test('pilot bootstrap continues to resolve only the canonical role and fail closed', () => {
  const bootstrap = readFileSync(
    fileURLToPath(new URL('../src/bootstrap-pilot-tenant.ts', import.meta.url)),
    'utf8',
  );
  assert.match(bootstrap, /SELECT id FROM roles WHERE name = 'tenant_admin' LIMIT 1/);
  assert.match(bootstrap, /if \(!role\) throw new Error\('TENANT_ADMIN_ROLE_NOT_SEEDED'\)/);
  assert.match(bootstrap, /PILOT_ADMIN_SUBJECT_CONFLICT/);
  assert.doesNotMatch(bootstrap, /INSERT INTO roles|INSERT INTO permissions/);
});
