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
});
