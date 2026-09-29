import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function requiredSha(value) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? ''))
    throw new Error('GIT_SHA must be a full 40-character commit SHA');
  return value.toLowerCase();
}

function imageRecord(component, env) {
  const prefix = component.toUpperCase();
  const image = env[`${prefix}_IMAGE`] || null;
  const digest = env[`${prefix}_DIGEST`] || null;
  if (digest && !/^sha256:[0-9a-f]{64}$/i.test(digest)) {
    throw new Error(`${prefix}_DIGEST must be a sha256 OCI digest`);
  }
  if (digest && !image) throw new Error(`${prefix}_IMAGE is required when a digest is supplied`);
  return {
    name: `codecore-growth-${component}`,
    image,
    digest,
    sbom: image && digest ? `${image}@${digest} (OCI SBOM attestation)` : null,
  };
}

export async function createReleaseManifest(env = process.env) {
  const packageJsonText = await readFile(resolve(repositoryRoot, 'package.json'), 'utf8');
  const packageJson = JSON.parse(packageJsonText.replace(/^\uFEFF/, ''));
  const journal = JSON.parse(
    await readFile(resolve(repositoryRoot, 'packages/db/drizzle/meta/_journal.json'), 'utf8'),
  );
  const latestMigration = journal.entries.at(-1);
  if (!latestMigration) throw new Error('Migration journal is empty');

  const gitSha = requiredSha(
    env.GIT_SHA ||
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(),
  );
  const epoch = env.SOURCE_DATE_EPOCH ? Number(env.SOURCE_DATE_EPOCH) : undefined;
  if (epoch !== undefined && (!Number.isSafeInteger(epoch) || epoch < 0)) {
    throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer');
  }
  const buildTimestamp =
    env.BUILD_TIMESTAMP || new Date((epoch ?? Date.now() / 1000) * 1000).toISOString();
  if (!Number.isFinite(Date.parse(buildTimestamp)))
    throw new Error('BUILD_TIMESTAMP must be a valid timestamp');
  const version = (env.RELEASE_VERSION || packageJson.version).replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('RELEASE_VERSION must be semantic version text');
  }

  let previousRelease = null;
  if (env.PREVIOUS_RELEASE_MANIFEST_PATH) {
    const previous = JSON.parse(
      await readFile(resolve(env.PREVIOUS_RELEASE_MANIFEST_PATH), 'utf8'),
    );
    if (
      typeof previous.version !== 'string' ||
      !/^[0-9a-f]{40}$/i.test(previous.gitSha ?? '') ||
      !Array.isArray(previous.components) ||
      previous.components.length !== 3 ||
      previous.components.some(
        (component) => !component.image || !/^sha256:[0-9a-f]{64}$/i.test(component.digest ?? ''),
      )
    ) {
      throw new Error(
        'Previous release manifest must identify all three immutable component digests',
      );
    }
    previousRelease = {
      version: previous.version,
      gitSha: previous.gitSha,
      buildId: previous.buildId,
      components: previous.components.map(({ name, image, digest }) => ({ name, image, digest })),
      migration: { latestTag: previous.migration?.latestTag ?? null },
    };
  }

  return {
    schemaVersion: 1,
    product: 'CODECORE Growth Intelligence OS',
    version,
    gitSha,
    buildTimestamp: new Date(buildTimestamp).toISOString(),
    buildId: env.BUILD_ID || `local-${gitSha.slice(0, 12)}`,
    workflowRun: env.GITHUB_RUN_ID ? `${env.GITHUB_RUN_ID}.${env.GITHUB_RUN_ATTEMPT || '1'}` : null,
    migration: {
      latestTag: latestMigration.tag,
      latestJournalTimestamp: latestMigration.when,
      compatibilityPolicy: 'Forward-only; verify schema compatibility before application rollback.',
    },
    sourceSbom: env.SOURCE_SBOM || 'source.cdx.json',
    components: ['api', 'web', 'worker'].map((component) => imageRecord(component, env)),
    rollback: {
      previousRelease,
      procedure:
        'Select the previous known-good release manifest and deploy its exact image digests.',
      databaseDowngrade: 'Not automatic; migrations are forward-only unless separately approved.',
    },
  };
}

async function main() {
  const output = resolve(process.argv[2] || 'artifacts/release/release-manifest.json');
  const currentSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  if (status) throw new Error('Release manifest generation requires a clean working tree');
  if (process.env.GIT_SHA && process.env.GIT_SHA.toLowerCase() !== currentSha.toLowerCase()) {
    throw new Error('GIT_SHA does not match the checked out commit');
  }
  const manifest = await createReleaseManifest();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
