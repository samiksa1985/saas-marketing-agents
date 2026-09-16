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
  'Migration 0025' = 'migration0025'
  'Migration 0026' = 'migration0026'
  'Migration 0027' = 'migration0027'
  'Migration 0028' = 'migration0028'
  'Migration 0029' = 'migration0029'
  'Migration 0030' = 'migration0030'
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
  'EPIC-08 persistence' = 'epic08Persistence'
  'EPIC-08 RLS' = 'epic08Rls'
  'EPIC-08 observation idempotency' = 'epic08ObservationIdempotency'
  'EPIC-08 learning isolation' = 'epic08LearningIsolation'
  'EPIC-08 fixture cleanup' = 'epic08FixtureCleanup'
  'EPIC-09 persistence' = 'epic09Persistence'
  'EPIC-09 RLS' = 'epic09Rls'
  'EPIC-09 lead idempotency' = 'epic09LeadIdempotency'
  'EPIC-09 identity deduplication' = 'epic09IdentityDeduplication'
  'EPIC-09 cross-tenant denial' = 'epic09CrossTenantDenial'
  'EPIC-09 missing-context denial' = 'epic09MissingContextDenial'
  'EPIC-09 revenue-event idempotency' = 'epic09RevenueEventIdempotency'
  'EPIC-09 fixture cleanup' = 'epic09FixtureCleanup'
  'EPIC-10 persistence' = 'epic10Persistence'
  'EPIC-10 RLS' = 'epic10Rls'
  'EPIC-10 conversation ingestion' = 'epic10ConversationIngestion'
  'EPIC-10 receptionist ingestion' = 'epic10ReceptionistIngestion'
  'EPIC-10 cross-tenant denial' = 'epic10CrossTenantDenial'
  'EPIC-10 missing-context denial' = 'epic10MissingContextDenial'
  'EPIC-10 fixture cleanup' = 'epic10FixtureCleanup'
  'EPIC-11 persistence' = 'epic11Persistence'
  'EPIC-11 RLS' = 'epic11Rls'
  'EPIC-11 journey-event idempotency' = 'epic11JourneyEventIdempotency'
  'EPIC-11 next-best-action idempotency' = 'epic11NextBestActionIdempotency'
  'EPIC-11 journey-outcome idempotency' = 'epic11JourneyOutcomeIdempotency'
  'EPIC-11 cross-tenant denial' = 'epic11CrossTenantDenial'
  'EPIC-11 missing-context denial' = 'epic11MissingContextDenial'
  'EPIC-11 learning isolation' = 'epic11LearningIsolation'
  'EPIC-11 fixture cleanup' = 'epic11FixtureCleanup'
  'EPIC-12 persistence' = 'epic12Persistence'
  'EPIC-12 RLS' = 'epic12Rls'
  'EPIC-12 plan idempotency' = 'epic12ActivationPlanIdempotency'
  'EPIC-12 candidate idempotency' = 'epic12ActivationCandidateIdempotency'
  'EPIC-12 execution idempotency' = 'epic12ActivationExecutionIdempotency'
  'EPIC-12 outcome idempotency' = 'epic12ActivationOutcomeIdempotency'
  'EPIC-12 cross-tenant denial' = 'epic12CrossTenantDenial'
  'EPIC-12 missing-context denial' = 'epic12MissingContextDenial'
  'EPIC-12 learning isolation' = 'epic12LearningIsolation'
  'EPIC-12 fixture cleanup' = 'epic12FixtureCleanup'
  'EPIC-13 persistence' = 'epic13Persistence'
  'EPIC-13 RLS' = 'epic13Rls'
  'EPIC-13 decision/context idempotency' = 'epic13DecisionContextIdempotency'
  'EPIC-13 candidate idempotency' = 'epic13CandidateIdempotency'
  'EPIC-13 recommendation idempotency' = 'epic13RecommendationIdempotency'
  'EPIC-13 verified-outcome idempotency' = 'epic13VerifiedOutcomeIdempotency'
  'EPIC-13 cross-tenant denial' = 'epic13CrossTenantDenial'
  'EPIC-13 missing-context denial' = 'epic13MissingContextDenial'
  'EPIC-13 learning isolation' = 'epic13LearningIsolation'
  'EPIC-13 fixture cleanup' = 'epic13FixtureCleanup'
}

foreach ($label in $expected.Keys) {
  $property = $result.checks.PSObject.Properties[$expected[$label]]
  $value = if ($null -eq $property) { $null } else { $property.Value }
  if ($value -ne 'PASS' -and -not ($label -eq 'FORCE RLS' -and $value -eq 'NOT_REQUIRED_NON_OWNER_ROLE')) {
    throw "${label} is not verified as PASS: $value"
  }
  Write-Host "${label}: $value"
}

if ($result.migrationCount -ne 31 -or $result.latestMigration -ne '0030_customer_growth_decisioning') {
  throw "EPIC-13 evidence does not prove the canonical 31-migration chain through 0030. Count=$($result.migrationCount); latest=$($result.latestMigration)"
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
if (-not $result.epic08 -or $result.epic08.migrationLedgerEntries -ne 1 -or
    $result.epic08.rlsTables -ne 8 -or $result.epic08.observationIdempotency.created -ne 1 -or
    $result.epic08.observationIdempotency.duplicates -ne 1 -or
    $result.epic08.learningIsolation -ne 'PASS' -or $result.epic08.cleanup -ne 'PASS') {
  throw 'EPIC-08 evidence is missing or does not prove migration ledger, eight RLS tables, observation idempotency, learning isolation, and fixture cleanup.'
}
if (-not $result.epic09 -or $result.epic09.migrationLedgerEntries -ne 1 -or
    $result.epic09.rlsTables -ne 20 -or $result.epic09.leadIdempotency.created -ne 1 -or
    $result.epic09.leadIdempotency.duplicates -ne 1 -or $result.epic09.identityDeduplication.created -ne 1 -or
    $result.epic09.identityDeduplication.duplicates -ne 1 -or $result.epic09.crossTenantDenied -ne 'PASS' -or
    $result.epic09.missingContextDenied -ne 'PASS' -or $result.epic09.revenueEventIdempotency -ne 'PASS' -or
    $result.epic09.cleanup -ne 'PASS') {
  throw 'EPIC-09 evidence is missing or does not prove migration ledger, RLS, idempotency, tenant denials, and fixture cleanup.'
}
if (-not $result.epic10 -or $result.epic10.migrationLedgerEntries -ne 1 -or
    $result.epic10.rlsTables -ne 22 -or $result.epic10.conversationIngestion.attempts -ne 2 -or
    $result.epic10.conversationIngestion.created -ne 1 -or $result.epic10.conversationIngestion.duplicates -ne 1 -or
    $result.epic10.receptionistIngestion.attempts -ne 2 -or $result.epic10.receptionistIngestion.created -ne 1 -or
    $result.epic10.receptionistIngestion.duplicates -ne 1 -or $result.epic10.crossTenantDenied -ne 'PASS' -or
    $result.epic10.missingContextDenied -ne 'PASS' -or $result.epic10.cleanup -ne 'PASS') {
  throw 'EPIC-10 evidence is missing or does not prove RLS, idempotency, tenant denials, and fixture cleanup.'
}
if (-not $result.epic11 -or $result.epic11.migrationLedgerEntries -ne 1 -or
    $result.epic11.rlsTables -ne 19 -or $result.epic11.journeyEvent.attempts -ne 2 -or
    $result.epic11.journeyEvent.created -ne 1 -or $result.epic11.journeyEvent.duplicates -ne 1 -or
    $result.epic11.nextBestAction.attempts -ne 2 -or $result.epic11.nextBestAction.created -ne 1 -or
    $result.epic11.nextBestAction.duplicates -ne 1 -or $result.epic11.journeyOutcome.attempts -ne 2 -or
    $result.epic11.journeyOutcome.created -ne 1 -or $result.epic11.journeyOutcome.duplicates -ne 1 -or
    $result.epic11.crossTenantDenied -ne 'PASS' -or $result.epic11.missingContextDenied -ne 'PASS' -or
    $result.epic11.learningIsolation -ne 'PASS' -or $result.epic11.cleanup -ne 'PASS') {
  throw 'EPIC-11 evidence is missing or does not prove RLS, three idempotency paths, tenant denials, learning isolation, and fixture cleanup.'
}
if (-not $result.epic12 -or $result.epic12.migrationLedgerEntries -ne 1 -or
    $result.epic12.rlsTables -ne 8 -or $result.epic12.plan.attempts -ne 2 -or
    $result.epic12.plan.created -ne 1 -or $result.epic12.plan.duplicates -ne 1 -or
    $result.epic12.candidate.created -ne 1 -or $result.epic12.execution.created -ne 1 -or
    $result.epic12.outcome.created -ne 1 -or $result.epic12.crossTenantDenied -ne 'PASS' -or
    $result.epic12.missingContextDenied -ne 'PASS' -or $result.epic12.learningIsolation -ne 'PASS' -or
    $result.epic12.cleanup -ne 'PASS') {
  throw 'EPIC-12 evidence is missing or does not prove RLS, single-authority idempotency, tenant denials, learning isolation, and fixture cleanup.'
}
if (-not $result.epic13 -or $result.epic13.migrationLedgerEntries -ne 1 -or
    $result.epic13.rlsTables -ne 8 -or $result.epic13.context.attempts -ne 2 -or
    $result.epic13.context.created -ne 1 -or $result.epic13.context.duplicates -ne 1 -or
    $result.epic13.candidate.attempts -ne 2 -or $result.epic13.candidate.created -ne 1 -or $result.epic13.candidate.duplicates -ne 1 -or
    $result.epic13.recommendation.attempts -ne 2 -or $result.epic13.recommendation.created -ne 1 -or
    $result.epic13.recommendation.duplicates -ne 1 -or $result.epic13.outcome.attempts -ne 2 -or
    $result.epic13.outcome.created -ne 1 -or $result.epic13.outcome.duplicates -ne 1 -or
    $result.epic13.crossTenantDenied -ne 'PASS' -or $result.epic13.missingContextDenied -ne 'PASS' -or
    $result.epic13.learningIsolation -ne 'PASS' -or $result.epic13.cleanup -ne 'PASS') {
  throw 'EPIC-13 evidence is missing or does not prove RLS, single-authority idempotency, tenant denials, learning isolation, and fixture cleanup.'
}

Write-Host 'PHASE1_EVIDENCE_VERIFICATION=PASS'
