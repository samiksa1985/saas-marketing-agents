import assert from 'node:assert/strict';
import test from 'node:test';
import { pilotBootstrapDatabaseUrl, pilotBootstrapInput } from './bootstrap-pilot-tenant.js';

test('pilot bootstrap is explicit and rejects missing confirmation or a non-UUID tenant', () => {
  assert.throws(() => pilotBootstrapInput({}), /CONFIRM/);
  assert.throws(() => pilotBootstrapInput({ PILOT_BOOTSTRAP_CONFIRM: 'YES', PILOT_TENANT_ID: 'tenant-a', PILOT_TENANT_NAME: 'Pilot', PILOT_ADMIN_SUBJECT: 'subject', PILOT_ADMIN_DISPLAY_NAME: 'Admin' }), /INVALID/);
  assert.equal(pilotBootstrapInput({ PILOT_BOOTSTRAP_CONFIRM: 'YES', PILOT_TENANT_ID: '11111111-1111-4111-8111-111111111111', PILOT_TENANT_NAME: 'Pilot', PILOT_ADMIN_SUBJECT: 'subject', PILOT_ADMIN_DISPLAY_NAME: 'Admin' }).tenantName, 'Pilot');
});

test('pilot bootstrap has a narrow database-only configuration contract', () => {
  const env = {
    PILOT_BOOTSTRAP_CONFIRM: 'YES',
    PILOT_TENANT_ID: '11111111-1111-4111-8111-111111111111',
    PILOT_TENANT_NAME: 'Pilot',
    PILOT_ADMIN_SUBJECT: 'pilot-admin@codecore.ai',
    PILOT_ADMIN_DISPLAY_NAME: 'Pilot Admin',
    DATABASE_URL: 'postgresql://pilot:local@127.0.0.1:55432/pilot',
  };
  assert.equal(pilotBootstrapDatabaseUrl(env), env.DATABASE_URL);
  assert.doesNotThrow(() => pilotBootstrapInput(env));
  assert.throws(() => pilotBootstrapDatabaseUrl({}), /DATABASE_URL_REQUIRED/);
});
