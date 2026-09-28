import * as assert from 'node:assert/strict';
import test from 'node:test';

import { MarketingOSExecutionService as canonicalService } from '@platform/marketing-os-core';
import { MarketingOSExecutionService as compatibilityService } from './index.js';

test('compatibility package re-exports the canonical Marketing OS execution service', () => {
  assert.equal(compatibilityService, canonicalService);
});
