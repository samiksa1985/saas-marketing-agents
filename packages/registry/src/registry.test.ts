import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DependencyGraphLoader,
  DependencyGraphValidator,
  DependencyReadinessResolver,
  RegistryLoader,
  RegistryValidation,
} from './index.js';

function workspaceRoot(): string {
  let current = process.cwd();
  while (current !== join(current, '..')) {
    if (existsSync(join(current, 'strategy', 'workstreams'))) return current;
    current = join(current, '..');
  }
  throw new Error('Workspace root not found');
}

const root = workspaceRoot();

test('repository discovers exactly 71 agents', async () => {
  assert.equal((await new RegistryLoader(root).loadAgents()).all().length, 71);
});

test('repository discovers exactly 13 workstreams', async () => {
  assert.equal((await new RegistryLoader(root).loadWorkstreams()).all().length, 13);
});

test('duplicate agent IDs are rejected', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'registry-'));
  await Promise.all(
    ['one', 'two'].map(async (directory) => {
      await mkdir(join(fixture, directory));
      await writeFile(
        join(fixture, directory, 'agent.md'),
        '---\nagent_id: duplicate\nname: Agent\ndescription: Specialty\n---\n# Agent\n\n## Core Mission\nMission\n\n## Deliverables\nOutput\n',
      );
    }),
  );
  await assert.rejects(
    () => new RegistryLoader(fixture, ['one', 'two']).loadAgents(),
    RegistryValidation,
  );
});

test('missing source files are rejected', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'registry-'));
  await mkdir(join(fixture, 'one'));
  await assert.rejects(() => new RegistryLoader(fixture, ['one']).loadAgents(), RegistryValidation);
});

test('dependency graph loads without blocking cycles', async () => {
  const graph = await new DependencyGraphLoader(root).load();
  assert.equal(graph.workstreamIds.length, 13);
  assert.equal(new DependencyGraphValidator().findCycles(graph.edges).length, 0);
  assert.ok(graph.edges.length > 0);
});

test('unresolved dependencies remain unresolved', async () => {
  const graph = await new DependencyGraphLoader(root).load();
  assert.ok(graph.edges.some((edge) => edge.kind === 'unresolved'));
});

test('blocking dependency prevents readiness', () => {
  const result = new DependencyReadinessResolver().resolve({
    tenantContext: { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' },
    requiredApprovals: true,
    requiredInputs: true,
    dependencies: [{ workstreamId: '02', satisfied: false, kind: 'blocking' }],
    artifacts: [],
  });
  assert.equal(result.state, 'blocked');
});

test('accepted artifact satisfies a same-tenant dependency', () => {
  const result = new DependencyReadinessResolver().resolve({
    tenantContext: { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' },
    requiredApprovals: true,
    requiredInputs: true,
    dependencies: [],
    artifacts: [
      {
        artifactId: 'artifact-a',
        version: '1',
        tenantId: 'tenant-a',
        status: 'approved',
        accepted: true,
      },
    ],
  });
  assert.equal(result.state, 'ready');
});

test('tenant context is mandatory', () => {
  const result = new DependencyReadinessResolver().resolve({
    requiredApprovals: true,
    requiredInputs: true,
    dependencies: [],
    artifacts: [],
  });
  assert.equal(result.state, 'blocked');
  assert.ok(result.reasons.includes('Tenant context is required'));
});

test('cross-tenant access is denied', () => {
  const result = new DependencyReadinessResolver().resolve({
    tenantContext: { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' },
    requiredApprovals: true,
    requiredInputs: true,
    dependencies: [],
    artifacts: [
      {
        artifactId: 'artifact-b',
        version: '1',
        tenantId: 'tenant-b',
        status: 'approved',
        accepted: true,
      },
    ],
  });
  assert.equal(result.state, 'blocked');
});

test('Arabic and English locale metadata remains valid', async () => {
  const agents = await new RegistryLoader(root).loadAgents();
  assert.ok(agents.all().every((agent) => agent.name.length > 0 && agent.version.length > 0));
  assert.deepEqual(['en', 'ar', 'en-US', 'ar-SA'].sort(), ['ar', 'ar-SA', 'en', 'en-US'].sort());
});
