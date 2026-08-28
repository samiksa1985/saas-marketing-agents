import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAgentDefinition } from './definition-loader.js';

function findRepositoryRoot(start: string): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, 'strategy', 'workstreams')) && existsSync(join(current, 'abm'))) return current;
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

async function findFirstAgentSource(): Promise<string> {
  const root = findRepositoryRoot(process.cwd());
  for (const directory of ['abm','analytics','growth','marketing']) {
    try {
      const entries = await readdir(join(root,directory), { withFileTypes:true });
      const file = entries
        .filter((entry)=>entry.isFile() && entry.name.endsWith('.md'))
        .sort((a,b)=>a.name.localeCompare(b.name))[0];
      if (file) return `${directory}/${file.name}`;
    } catch {}
  }
  throw new Error('No agent definition source was found for loader test');
}

test('agent definition loader reads a repository agent definition', async()=>{
  const sourcePath=await findFirstAgentSource();
  const definition=await loadAgentDefinition(sourcePath);
  assert.ok(definition.agentId.length>0);
  assert.ok(definition.name.length>0);
  assert.equal(definition.sourcePath,sourcePath);
  assert.match(definition.sourceRevision,/^[a-f0-9]{64}$/);
  assert.match(definition.version,/^sha256:[a-f0-9]{16}$/);
  assert.ok(Array.isArray(definition.mission));
  assert.ok(Array.isArray(definition.criticalRules));
  assert.ok(Array.isArray(definition.deliverables));
  assert.ok(Array.isArray(definition.needsInput));
});

test('agent definition loader is deterministic for the same source', async()=>{
  const sourcePath=await findFirstAgentSource();
  assert.deepEqual(await loadAgentDefinition(sourcePath), await loadAgentDefinition(sourcePath));
});

test('agent definition loader normalizes Windows paths', async()=>{
  const sourcePath=await findFirstAgentSource();
  const definition=await loadAgentDefinition(sourcePath.replace(/\//g,'\\'));
  assert.equal(definition.sourcePath,sourcePath);
  assert.ok(definition.name.length>0);
});
