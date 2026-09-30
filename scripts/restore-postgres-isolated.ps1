param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [switch]$CreateDatabase
)
# WS-PROD-03 isolated restore. NEVER restores over a canonical database:
# the target URL must name a disposable database containing
# restore/recovery/acceptance and must differ from DATABASE_URL.
# ISOLATED_RESTORE_DATABASE_URL is consumed but never printed.
$ErrorActionPreference = 'Stop'
if ($env:NAWA_ISOLATED_RESTORE_CONFIRM -ne 'YES') { throw 'Set NAWA_ISOLATED_RESTORE_CONFIRM=YES only for an isolated restore target.' }
if ([string]::IsNullOrWhiteSpace($env:ISOLATED_RESTORE_DATABASE_URL) -and [string]::IsNullOrWhiteSpace($env:ISOLATED_RESTORE_DATABASE_URL_FILE)) {
  throw 'ISOLATED_RESTORE_DATABASE_URL or ISOLATED_RESTORE_DATABASE_URL_FILE is required.'
}
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL) -and [string]::IsNullOrWhiteSpace($env:DATABASE_URL_FILE)) {
  throw 'DATABASE_URL or DATABASE_URL_FILE is required to prove the restore target is isolated.'
}
Import-Module (Join-Path $PSScriptRoot 'postgres-cli.psm1') -Force

function Get-DatabaseIdentity([string]$environmentName) {
  $parsed = Get-PostgresConnectionMetadata -ConnectionEnvironment $environmentName
  return [pscustomobject]@{
    HostName = ([string]$parsed.host).TrimEnd('.').ToLowerInvariant()
    Port = [int]$parsed.port
    Database = [string]$parsed.database
    User = [string]$parsed.username
  }
}

function Get-NormalizedHostName([string]$value) {
  $h = $value.TrimEnd('.').ToLowerInvariant()
  if ($h -in @('localhost', '127.0.0.1', '::1')) { return 'localhost' }
  return $h
}

function Resolve-Tool([string]$explicit, [string]$name) {
  if (-not [string]::IsNullOrWhiteSpace($explicit)) {
    if (-not (Test-Path -LiteralPath $explicit)) { throw "$name path is configured but missing." }
    return $explicit
  }
  $onPath = Get-Command $name -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  return $null
}

function Invoke-PsqlProbe([string]$mode, [string]$connectionEnvironment, [string]$sql, [string]$dockerContainer, [string]$dbUser, [string]$database) {
  if ($mode -eq 'host-binaries') {
    $psql = Resolve-Tool $env:PG_PSQL_PATH 'psql'
    if (-not $psql) { throw 'Identity verification requires psql (PG_PSQL_PATH or PATH).' }
    return Invoke-PostgresTool -Tool $psql -ConnectionEnvironment $connectionEnvironment `
      -Database $database -ToolArguments @('-tAc', $sql) -CaptureOutput
  }
  $output = docker exec $dockerContainer psql -U $dbUser -d $database -tAc $sql
  return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n").Trim() }
}

function Assert-TargetIdentityNonDestructive([string]$mode, $targetIdentity, $sourceIdentity, [string]$dockerContainer, [bool]$createDatabase) {
  # First, prove the server identity from the safe postgres database.
  $serverProbe = Invoke-PsqlProbe $mode 'ISOLATED_RESTORE_DATABASE_URL' "SELECT COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port()::text" $dockerContainer $targetIdentity.User 'postgres'
  if ($serverProbe.ExitCode -ne 0) { throw 'RESTORE_TARGET_IDENTITY_PROBE_FAILED' }

  $targetExists = Invoke-PsqlProbe $mode 'ISOLATED_RESTORE_DATABASE_URL' "SELECT 1 FROM pg_database WHERE datname = '$($targetIdentity.Database)'" $dockerContainer $targetIdentity.User 'postgres'
  if ($targetExists.ExitCode -ne 0) { throw 'RESTORE_TARGET_IDENTITY_PROBE_FAILED' }

  if ($createDatabase) {
    if ($targetExists.Output -eq '1') { throw 'RESTORE_TARGET_DATABASE_ALREADY_EXISTS' }
  } else {
    if ($targetExists.Output -ne '1') { throw 'RESTORE_TARGET_DATABASE_MISSING' }
    $databaseProbe = Invoke-PsqlProbe $mode 'ISOLATED_RESTORE_DATABASE_URL' 'SELECT current_database()' $dockerContainer $targetIdentity.User $targetIdentity.Database
    if ($databaseProbe.ExitCode -ne 0) { throw 'RESTORE_TARGET_IDENTITY_PROBE_FAILED' }
    if ($databaseProbe.Output -ne $targetIdentity.Database) { throw 'RESTORE_TARGET_IDENTITY_DATABASE_MISMATCH' }
  }

  if ((Get-NormalizedHostName $targetIdentity.HostName) -eq (Get-NormalizedHostName $sourceIdentity.HostName) -and
      $targetIdentity.Port -eq $sourceIdentity.Port -and
      $targetIdentity.Database -eq $sourceIdentity.Database) {
    throw 'RESTORE_TARGET_MATCHES_SOURCE_DATABASE'
  }
}

# Validate both identities before any database creation or pg_restore --clean.
$target = Get-DatabaseIdentity 'ISOLATED_RESTORE_DATABASE_URL'
$source = Get-DatabaseIdentity 'DATABASE_URL'
$targetDb = $target.Database
$dbUser = $target.User
if ([string]::IsNullOrWhiteSpace($dbUser)) { throw 'ISOLATED_RESTORE_DATABASE_URL must include a user.' }
if ($target.Database -notmatch '^[A-Za-z0-9_]+$') { throw 'RESTORE_TARGET_DATABASE_INVALID' }
if ($target.Database -in @('ai_marketing_phase1', 'platform', 'postgres', 'template0', 'template1')) {
  throw 'RESTORE_TARGET_CANONICAL_DATABASE'
}
if ($target.Database -notmatch '(?i)(restore|recovery|acceptance)') {
  throw 'Restore target database name must explicitly identify an isolated restore/recovery database.'
}
if ((Get-NormalizedHostName $target.HostName) -eq (Get-NormalizedHostName $source.HostName) -and $target.Port -eq $source.Port -and $target.Database -eq $source.Database) {
  throw 'RESTORE_TARGET_MATCHES_SOURCE_DATABASE'
}
if (-not (Test-Path -LiteralPath $BackupFile)) { throw 'Backup file does not exist.' }

$pgRestore = Resolve-Tool $env:PG_RESTORE_PATH 'pg_restore'
$dockerContainer = $env:PG_DOCKER_CONTAINER
$mode = if ($pgRestore) { 'host-binaries' } elseif (-not [string]::IsNullOrWhiteSpace($dockerContainer)) { 'docker-exec' } else { throw 'No pg_restore available. Install PostgreSQL 16 client tools or set PG_DOCKER_CONTAINER for a local drill.' }

# Non-destructive identity proof before any CREATE DATABASE or pg_restore --clean.
Assert-TargetIdentityNonDestructive $mode $target $source $dockerContainer $CreateDatabase

# Structural pre-flight: refuse to copy/restore an artifact pg_restore cannot parse.
if ($mode -eq 'host-binaries') {
  $list = & $pgRestore --list $BackupFile
  if ($LASTEXITCODE -ne 0 -or -not $list -or $list.Count -lt 10) { throw 'BACKUP_ARTIFACT_UNREADABLE' }
}

if ($mode -eq 'host-binaries') {
  if ($CreateDatabase) {
    $psql = Resolve-Tool $env:PG_PSQL_PATH 'psql'
    if (-not $psql) { throw 'CreateDatabase requires psql (PG_PSQL_PATH or PATH) in host-binaries mode.' }
    $exists = Invoke-PsqlProbe $mode 'ISOLATED_RESTORE_DATABASE_URL' "SELECT 1 FROM pg_database WHERE datname = '$targetDb'" $dockerContainer $target.User 'postgres'
    if ($exists.ExitCode -ne 0) { throw 'RESTORE_TARGET_PROBE_FAILED' }
    if ($exists.Output -ne '1') {
      $create = Invoke-PsqlProbe $mode 'ISOLATED_RESTORE_DATABASE_URL' "CREATE DATABASE `"$targetDb`"" $dockerContainer $target.User 'postgres'
      if ($create.ExitCode -ne 0) { throw 'RESTORE_TARGET_CREATE_FAILED' }
    }
  }
  $restore = Invoke-PostgresTool -Tool $pgRestore -ConnectionEnvironment 'ISOLATED_RESTORE_DATABASE_URL' `
    -ToolArguments @('--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-privileges', $BackupFile)
  if ($restore.ExitCode -ne 0) { throw 'Isolated restore failed.' }
} else {
  $containerTmp = "/tmp/wsp03-restore-$targetDb.dump"
  try {
    docker cp $BackupFile "${dockerContainer}:$containerTmp"
    if ($LASTEXITCODE -ne 0) { throw 'RESTORE_ARTIFACT_IMPORT_FAILED' }
    $list = docker exec $dockerContainer pg_restore --list $containerTmp
    if ($LASTEXITCODE -ne 0 -or -not $list -or $list.Count -lt 10) { throw 'BACKUP_ARTIFACT_UNREADABLE' }
    if ($CreateDatabase) {
      $exists = docker exec $dockerContainer psql -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$targetDb'"
      if ($LASTEXITCODE -ne 0) { throw 'RESTORE_TARGET_PROBE_FAILED' }
      if ($exists -ne '1') {
        docker exec $dockerContainer psql -U $dbUser -d postgres -c "CREATE DATABASE `"$targetDb`""
        if ($LASTEXITCODE -ne 0) { throw 'RESTORE_TARGET_CREATE_FAILED' }
      }
    }
    docker exec $dockerContainer pg_restore -U $dbUser -d $targetDb --exit-on-error --clean --if-exists --no-owner --no-privileges $containerTmp
    if ($LASTEXITCODE -ne 0) { throw 'Isolated restore failed.' }
  } finally {
    docker exec $dockerContainer rm -f $containerTmp 2>$null | Out-Null
  }
}

$restoredIdentity = Invoke-PsqlProbe $mode 'ISOLATED_RESTORE_DATABASE_URL' 'SELECT current_database()' $dockerContainer $target.User $targetDb
if ($restoredIdentity.ExitCode -ne 0) { throw 'RESTORE_TARGET_IDENTITY_PROBE_FAILED' }
if ($restoredIdentity.Output -ne $targetDb) { throw 'RESTORE_TARGET_IDENTITY_DATABASE_MISMATCH' }

Write-Output (ConvertTo-Json -Compress @{
    status = 'restored'
    target = 'isolated'
    database = $targetDb
    mode = $mode
    nextStep = 'Provision roles (provision:production-roles), then run packages/db restore:verify and production:verify against the isolated URL before any cutover.'
  })
