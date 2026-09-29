import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createReleaseManifest } from './create-release-manifest.mjs';

const sha = 'f'.repeat(40);

test('release manifest has stable component order, source identity, and migration reference', async () => {
  const manifest = await createReleaseManifest({
    GIT_SHA: sha,
    RELEASE_VERSION: 'v1.2.3',
    BUILD_TIMESTAMP: '2026-09-29T12:00:00.000Z',
    BUILD_ID: 'run-42',
  });
  assert.equal(manifest.product, 'CODECORE Growth Intelligence OS');
  assert.equal(manifest.version, '1.2.3');
  assert.equal(manifest.gitSha, sha);
  assert.deepEqual(
    manifest.components.map((component) => component.name),
    ['codecore-growth-api', 'codecore-growth-web', 'codecore-growth-worker'],
  );
  assert.ok(manifest.migration.latestTag);
  assert.equal(manifest.components[0].digest, null);
});

test('release manifest records immutable image digests and rejects malformed identities', async () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const manifest = await createReleaseManifest({
    GIT_SHA: sha,
    API_IMAGE: 'ghcr.io/example/codecore-growth-api:sha-test',
    API_DIGEST: digest,
  });
  assert.equal(manifest.components[0].digest, digest);
  assert.match(manifest.components[0].sbom, /OCI SBOM attestation/);
  await assert.rejects(
    () => createReleaseManifest({ GIT_SHA: 'short' }),
    /full 40-character commit SHA/,
  );
  await assert.rejects(
    () =>
      createReleaseManifest({ GIT_SHA: sha, API_IMAGE: 'example/api', API_DIGEST: 'mutable-tag' }),
    /sha256 OCI digest/,
  );
});

test('release manifest carries previous image digests and migration reference for rollback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codecore-release-'));
  try {
    const digest = `sha256:${'b'.repeat(64)}`;
    const previous = {
      version: '1.2.2',
      gitSha: 'a'.repeat(40),
      buildId: 'run-41',
      migration: { latestTag: '0031_previous' },
      components: ['api', 'web', 'worker'].map((component) => ({
        name: `codecore-growth-${component}`,
        image: `ghcr.io/example/codecore-growth-${component}:sha-old`,
        digest,
      })),
    };
    const path = join(directory, 'previous.json');
    await writeFile(path, JSON.stringify(previous));
    const manifest = await createReleaseManifest({
      GIT_SHA: sha,
      PREVIOUS_RELEASE_MANIFEST_PATH: path,
    });
    assert.equal(manifest.rollback.previousRelease.version, '1.2.2');
    assert.equal(manifest.rollback.previousRelease.components[0].digest, digest);
    assert.equal(manifest.rollback.previousRelease.migration.latestTag, '0031_previous');
    await writeFile(path, JSON.stringify({ ...previous, components: [] }));
    await assert.rejects(
      () => createReleaseManifest({ GIT_SHA: sha, PREVIOUS_RELEASE_MANIFEST_PATH: path }),
      /all three immutable component digests/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
