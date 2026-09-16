import assert from 'node:assert/strict';
import test from 'node:test';
import { pilotBootstrapInput } from './bootstrap-pilot-tenant.js';

test('pilot bootstrap is explicit and rejects missing confirmation or a non-UUID tenant', () => {
  assert.throws(() => pilotBootstrapInput({}), /CONFIRM/);
  assert.throws(() => pilotBootstrapInput({ PILOT_BOOTSTRAP_CONFIRM: 'YES', PILOT_TENANT_ID: 'tenant-a', PILOT_TENANT_NAME: 'Pilot', PILOT_ADMIN_SUBJECT: 'subject', PILOT_ADMIN_DISPLAY_NAME: 'Admin' }), /INVALID/);
  assert.equal(pilotBootstrapInput({ PILOT_BOOTSTRAP_CONFIRM: 'YES', PILOT_TENANT_ID: '11111111-1111-4111-8111-111111111111', PILOT_TENANT_NAME: 'Pilot', PILOT_ADMIN_SUBJECT: 'subject', PILOT_ADMIN_DISPLAY_NAME: 'Admin' }).tenantName, 'Pilot');
});
