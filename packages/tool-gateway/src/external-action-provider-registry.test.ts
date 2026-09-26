import assert from 'node:assert/strict';
import test from 'node:test';

import { ExternalActionProviderRegistry } from './external-action-provider-registry.js';

test('provider registry resolves only explicitly composed provider-neutral gateways', () => {
  const google = {};
  const meta = {};
  const registry = new ExternalActionProviderRegistry({
    GOOGLE_ADS: google as never,
    META_ADS: meta as never,
  });
  assert.equal(registry.get('google_ads'), google);
  assert.equal(registry.get('META_ADS'), meta);
  assert.throws(() => registry.get('UNTRUSTED_PROVIDER'), /EXTERNAL_ACTION_PROVIDER_UNSUPPORTED/);
  assert.throws(() => registry.capabilities('GOOGLE_ADS'), /EXTERNAL_ACTION_PROVIDER_CAPABILITY_UNSUPPORTED/);
});

test('provider registry exposes declared capabilities without leaking provider clients or credentials', () => {
  const registry = new ExternalActionProviderRegistry({
    GOOGLE_ADS: {
      gateway: {} as never,
      capabilities: { actionTypes: ['UPDATE_CAMPAIGN_BUDGET', 'UPDATE_TARGET_CPA'], budgetUnit: 'MAJOR' },
    },
    META_ADS: {
      gateway: {} as never,
      capabilities: { actionTypes: ['UPDATE_CAMPAIGN_BUDGET'], budgetUnit: 'MINOR' },
    },
  });
  assert.deepEqual(registry.capabilities('google_ads'), {
    actionTypes: ['UPDATE_CAMPAIGN_BUDGET', 'UPDATE_TARGET_CPA'], budgetUnit: 'MAJOR',
  });
  assert.deepEqual(registry.capabilities('META_ADS'), {
    actionTypes: ['UPDATE_CAMPAIGN_BUDGET'], budgetUnit: 'MINOR',
  });
});
