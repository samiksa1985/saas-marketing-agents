[CmdletBinding()]
param(
  [string]$EvidenceDirectory
)

$ErrorActionPreference = 'Stop'
$scriptDirectory = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot) -and (Test-Path -LiteralPath $PSScriptRoot -PathType Container)) {
  $PSScriptRoot
} elseif (-not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
  Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
  throw 'Cannot determine the Phase 1 script directory.'
}
. (Join-Path $scriptDirectory 'phase1-paths.ps1')
. (Join-Path $scriptDirectory 'phase1-evidence.ps1')
$repositoryRoot = Resolve-Phase1RepositoryRoot $PSScriptRoot $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($EvidenceDirectory)) {
  $EvidenceDirectory = Join-Path $repositoryRoot 'artifacts/phase1-postgres'
}

if (-not (Test-Path -LiteralPath $EvidenceDirectory)) {
  throw "Evidence directory does not exist: $EvidenceDirectory"
}

$latestResult = Get-ChildItem -LiteralPath $EvidenceDirectory -Filter 'phase1-*.result.json' -File |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if (-not $latestResult) { throw 'No persisted Phase 1 result file was found.' }

$result = Get-Phase1PersistedResult $latestResult.FullName
Write-Host "Evidence result: $($latestResult.FullName)"
if ($result.status -ne 'PASS') { throw "Latest Phase 1 result status is $($result.status), not PASS." }
if (-not $result.checks) { throw 'PASS result lacks checks; verification fails closed.' }

$expected = [ordered]@{
  'Migration chain' = 'migrationChain'
  'Migration 0020' = 'migration0020'
  'Migration 0021' = 'migration0021'
  'Migration 0022' = 'migration0022'
  'Migration 0023' = 'migration0023'
  'Migration 0024' = 'migration0024'
  'RLS' = 'rls'
  'FORCE RLS' = 'forceRls'
  'Tenant isolation' = 'tenantIsolation'
  'Pooled connection reset' = 'poolingLeak'
  'pgvector' = 'pgvector'
  'Billing authority' = 'billingAuthority'
  'Billing concurrency' = 'billingConcurrency'
  'Billing idempotency' = 'billingIdempotency'
  'Billing rollback' = 'billingRollback'
  'Billing cross-tenant isolation' = 'billingCrossTenantIsolation'
  'EPIC-03 policy persistence' = 'epic03PolicyPersistence'
  'EPIC-03 policy audit' = 'epic03PolicyAudit'
  'EPIC-03 RLS' = 'epic03Rls'
  'EPIC-03 outbox' = 'epic03Outbox'
  'EPIC-03 idempotency' = 'epic03Idempotency'
  'EPIC-03 concurrency' = 'epic03Concurrency'
  'EPIC-05 migration ledger' = 'epic05MigrationLedger'
  'EPIC-05 RLS' = 'epic05Rls'
  'EPIC-05 concurrent claim' = 'epic05ConcurrentClaim'
  'EPIC-05 lease recovery' = 'epic05LeaseRecovery'
  'EPIC-05 retry and backoff' = 'epic05Retry'
  'EPIC-05 dead letter' = 'epic05DeadLetter'
  'EPIC-05 replay' = 'epic05Replay'
  'EPIC-05 provider health' = 'epic05ProviderHealth'
  'EPIC-05 credential health' = 'epic05CredentialHealth'
  'EPIC-05 operator recovery' = 'epic05OperatorRecovery'
  'EPIC-05 worker boundary' = 'epic05WorkerBoundary'
  'EPIC-05 secret safety' = 'epic05SecretSafety'
  'EPIC-05 fixture cleanup' = 'epic05FixtureCleanup'
  'EPIC-07 persistence' = 'epic07Persistence'
  'EPIC-07 RLS' = 'epic07Rls'
  'EPIC-07 idempotency' = 'epic07Idempotency'
  'EPIC-07 fixture cleanup' = 'epic07FixtureCleanup'
}

foreach ($label in $expected.Keys) {
  $property = $result.checks.PSObject.Properties[$expected[$label]]
  $value = if ($null -eq $property) { $null } else { $property.Value }
  if ($value -ne 'PASS' -and -not ($label -eq 'FORCE RLS' -and $value -eq 'NOT_REQUIRED_NON_OWNER_ROLE')) {
    throw "${label} is not verified as PASS: $value"
  }
  Write-Host "${label}: $value"
}

if ($result.migrationCount -ne 25 -or $result.latestMigration -ne '0024_unified_campaign_orchestration') {
  throw "EPIC-07 evidence does not prove the canonical 25-migration chain through 0024. Count=$($result.migrationCount); latest=$($result.latestMigration)"
}
if (-not $result.epic03 -or $result.epic03.concurrency.successes -ne 1 -or $result.epic03.concurrency.conflicts -ne 1 -or $result.epic03.concurrency.unexpectedDuplicates -ne 0) {
  throw 'EPIC-03 concurrency evidence is missing or does not prove one owner, one conflict, and no duplicate.'
}
if (-not $result.epic05 -or $result.epic05.migrationLedgerEntries -ne 1 -or
    $result.epic05.concurrentClaim.successfulClaims -ne 1 -or
    $result.epic05.concurrentClaim.duplicateClaims -ne 0) {
  throw 'EPIC-05 evidence is missing or does not prove one migration ledger entry, one claim owner, and no duplicate claim.'
}
if (-not $result.epic07 -or $result.epic07.migrationLedgerEntries -ne 1 -or
    $result.epic07.rlsTables -ne 4 -or $result.epic07.idempotency.created -ne 1 -or
    $result.epic07.idempotency.duplicates -ne 1 -or $result.epic07.cleanup -ne 'PASS') {
  throw 'EPIC-07 evidence is missing or does not prove migration ledger, four RLS tables, idempotency, and fixture cleanup.'
}

Write-Host 'PHASE1_EVIDENCE_VERIFICATION=PASS'
