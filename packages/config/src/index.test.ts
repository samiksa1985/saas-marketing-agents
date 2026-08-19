import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './index.js';

test('configuration rejects missing secrets and accepts safe defaults', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'test' }));
  const config = loadConfig({
    NODE_ENV: 'test',
    WEB_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://test',
    TEMPORAL_ADDRESS: 'localhost:7233',
    TEMPORAL_NAMESPACE: 'test',
    ARTIFACT_BUCKET: 'test',
    AI_PROVIDER: 'mock',
    AI_MODEL: 'test',
  });
  assert.equal(config.apiPort, 4000);
});
