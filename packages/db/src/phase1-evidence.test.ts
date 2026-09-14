import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]$/, '');
const scriptsRoot = join(repositoryRoot, 'scripts');
const helperPath = join(scriptsRoot, 'phase1-evidence.ps1');
const pathsPath = join(scriptsRoot, 'phase1-paths.ps1');
const runnerPath = join(scriptsRoot, 'run-phase1-postgres-local.ps1');
const verifierPath = join(scriptsRoot, 'verify-phase1-postgres-evidence.ps1');

function powerShell(): string {
  return process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

test('a failed harness result is persisted before a non-zero runner exit is handled', () => {
  const directory = mkdtempSync(join(tmpdir(), 'phase1-evidence-'));
  const logPath = join(directory, 'phase1.log');
  const resultPath = join(directory, 'phase1.result.json');
  writeFileSync(logPath, 'PHASE1_POSTGRES_RESULT={"status":"FAIL","error":"synthetic"}\n');

  execFileSync(powerShell(), [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      `. ${quotePowerShell(helperPath)}`,
      `$result = Get-Phase1HarnessResultFromLog ${quotePowerShell(logPath)}`,
      `Save-Phase1EvidenceResult $result ${quotePowerShell(resultPath)}`,
    ].join('; '),
  ]);

  const persisted = JSON.parse(readFileSync(resultPath, 'utf8')) as {
    status: string;
    error: string;
    timestamp: string;
  };
  assert.equal(persisted.status, 'FAIL');
  assert.equal(persisted.error, 'synthetic');
  assert.equal(typeof persisted.timestamp, 'string');

  const runner = readFileSync(runnerPath, 'utf8');
  assert.match(
    runner,
    /Save-Phase1EvidenceResult \$result \$resultFile[\s\S]*if \(\$harnessExitCode -ne 0\)/,
  );
  assert.match(runner, /uv_os_get_passwd\.\*ENOMEM[\s\S]*build:phase1[\s\S]*\.phase1-compiled\/packages\/db\/scripts\/phase1-postgres\.js/);
  assert.match(runner, /docker compose -p \$ProjectName -f \$composeFile up -d/);
  assert.match(runner, /docker compose -p \$ProjectName -f \$composeFile down -v/);
});

test('verifier resolves its repository root from script location and reads persisted FAIL evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'phase1-verifier-'));
  writeFileSync(
    join(directory, 'phase1-20260907-000000.result.json'),
    '{"status":"FAIL","error":"synthetic"}\n',
  );

  const result = spawnSync(
    powerShell(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      verifierPath,
      '-EvidenceDirectory',
      directory,
    ],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Latest Phase 1 result status is FAIL/);

  const rootResolution = execFileSync(powerShell(), [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      `. ${quotePowerShell(pathsPath)}`,
      `$root = Resolve-Phase1RepositoryRoot '' ${quotePowerShell(verifierPath)}`,
      `if ($root -ne ${quotePowerShell(repositoryRoot)}) { throw 'incorrect repository root' }`,
    ].join('; '),
  ], { encoding: 'utf8' });
  assert.equal(rootResolution.trim(), '');
});

test('verifier fails closed when canonical evidence is missing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'phase1-verifier-missing-'));
  const result = spawnSync(
    powerShell(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      verifierPath,
      '-EvidenceDirectory',
      directory,
    ],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /No persisted Phase 1 result file was found/);
});

test('verifier fails closed when PASS evidence omits billing authority', () => {
  const directory = mkdtempSync(join(tmpdir(), 'phase1-verifier-billing-authority-'));
  writeFileSync(
    join(directory, 'phase1-20260908-000000.result.json'),
    JSON.stringify({
      status: 'PASS',
      checks: {
        migrationChain: 'PASS',
        migration0020: 'PASS',
        migration0021: 'PASS',
        migration0022: 'PASS',
        migration0023: 'PASS',
        migration0024: 'PASS',
        rls: 'PASS',
        forceRls: 'NOT_REQUIRED_NON_OWNER_ROLE',
        tenantIsolation: 'PASS',
        poolingLeak: 'PASS',
        pgvector: 'PASS',
        billingConcurrency: 'PASS',
        billingIdempotency: 'PASS',
        billingRollback: 'PASS',
        billingCrossTenantIsolation: 'PASS',
      },
    }),
  );

  const result = spawnSync(
    powerShell(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      verifierPath,
      '-EvidenceDirectory',
      directory,
    ],
    { cwd: directory, encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Billing authority is not verified as PASS/);
});

test('verifier fails closed when a PASS result does not prove migration 0024 and EPIC-07 checks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'phase1-verifier-epic03-'));
  writeFileSync(
    join(directory, 'phase1-20260908-000001.result.json'),
    JSON.stringify({
      status: 'PASS',
      migrationCount: 25,
      latestMigration: '0024_unified_campaign_orchestration',
      checks: {
        migrationChain: 'PASS', migration0020: 'PASS', migration0021: 'PASS', migration0022: 'PASS', migration0023: 'PASS',
        rls: 'PASS', forceRls: 'NOT_REQUIRED_NON_OWNER_ROLE', tenantIsolation: 'PASS', poolingLeak: 'PASS',
        pgvector: 'PASS', billingAuthority: 'PASS', billingConcurrency: 'PASS', billingIdempotency: 'PASS',
        billingRollback: 'PASS', billingCrossTenantIsolation: 'PASS',
        epic03PolicyPersistence: 'PASS', epic03PolicyAudit: 'PASS', epic03Rls: 'PASS', epic03Outbox: 'PASS',
        epic03Idempotency: 'PASS', epic03Concurrency: 'PASS',
      },
    }),
  );

  const result = spawnSync(powerShell(), [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', verifierPath,
    '-EvidenceDirectory', directory,
  ], { cwd: directory, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Migration 0024 is not verified as PASS/);
});
