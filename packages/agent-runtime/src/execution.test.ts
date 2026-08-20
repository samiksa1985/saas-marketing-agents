import { readdir } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadAgentDefinition,
} from './definition-loader.js';

async function findFirstAgentSource(): Promise<string> {
  const preferredDirectories = [
    'abm',
    'analytics',
    'growth',
    'marketing',
  ];

  for (const directory of preferredDirectories) {
    try {
      const entries = await readdir(directory, {
        withFileTypes: true,
      });

      const file = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith('.md'),
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name),
        )[0];

      if (file) {
        return `${directory}/${file.name}`;
      }
    } catch {
      // Directory may not exist.
    }
  }

  throw new Error(
    'No agent definition source was found for loader test',
  );
}

test(
  'agent definition loader reads a repository agent definition',
  async () => {
    const sourcePath =
      await findFirstAgentSource();

    const definition =
      await loadAgentDefinition(
        sourcePath,
      );

    assert.ok(
      definition.agentId.length > 0,
    );

    assert.ok(
      definition.name.length > 0,
    );

    assert.equal(
      definition.sourcePath,
      sourcePath,
    );

    assert.match(
      definition.sourceRevision,
      /^[a-f0-9]{64}$/,
    );

    assert.match(
      definition.version,
      /^sha256:[a-f0-9]{16}$/,
    );

    assert.ok(
      Array.isArray(
        definition.mission,
      ),
    );

    assert.ok(
      Array.isArray(
        definition.criticalRules,
      ),
    );

    assert.ok(
      Array.isArray(
        definition.deliverables,
      ),
    );

    assert.ok(
      Array.isArray(
        definition.needsInput,
      ),
    );
  },
);

test(
  'agent definition loader is deterministic for the same source',
  async () => {
    const sourcePath =
      await findFirstAgentSource();

    const first =
      await loadAgentDefinition(
        sourcePath,
      );

    const second =
      await loadAgentDefinition(
        sourcePath,
      );

    assert.deepEqual(
      second,
      first,
    );
  },
);

test(
  'agent definition loader normalizes Windows paths',
  async () => {
    const sourcePath =
      await findFirstAgentSource();

    const windowsStylePath =
      sourcePath.replace(
        /\//g,
        '\\',
      );

    const definition =
      await loadAgentDefinition(
        windowsStylePath,
      );

    assert.equal(
      definition.sourcePath,
      sourcePath,
    );

    assert.ok(
      definition.name.length > 0,
    );
  },
);