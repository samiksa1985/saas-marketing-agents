import test from 'node:test';
import assert from 'node:assert/strict';
import { PersistentMarketingMemoryRepository, MarketingOSPlanStore, MarketingOutcomeStore } from './index.js';
test('exports persistent marketing OS stores',()=>{assert.equal(typeof PersistentMarketingMemoryRepository,'function');assert.equal(typeof MarketingOSPlanStore,'function');assert.equal(typeof MarketingOutcomeStore,'function');});
