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
if ([string]::IsNullOrWhiteSpace($env:ISOLATED_RESTORE_DATABASE_URL)) { throw 'ISOLATED_RESTORE_DATABASE_URL is required and is never printed.' }
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'DATABASE_URL is required to prove the restore target is isolated.' }

function Get-DatabaseIdentity([string]$value) {
  try { $parsed = [System.Uri]$value } catch { throw 'Database URL is invalid.' }
  if (-not $parsed.IsAbsoluteUri -or $parsed.Scheme -notin @('postgres', 'postgresql') -or [string]::IsNullOrWhiteSpace($parsed.Host)) {
    throw 'Database URL must be an absolute PostgreSQL URL.'
  }
  $segments = $parsed.AbsolutePath.TrimStart('/').Split('/')
  if ($segments.Count -ne 1 -or [string]::IsNullOrWhiteSpace($segments[0])) {
    throw 'Database URL must identify exactly one database path component.'
  }
  $database = [System.Uri]::UnescapeDataString($segments[0])
  if ($database -notmatch '^[A-Za-z0-9_]+$') {
    throw 'Database URL must end in a simple, unencoded database name.'
  }
  $port = if ($parsed.IsDefaultPort -or $parsed.Port -lt 1) { 5432 } else { $parsed.Port }
  return [pscustomobject]@{
    Uri = $parsed
    Host = $parsed.DnsSafeHost.TrimEnd('.').ToLowerInvariant()
    Port = $port
    Database = $database
    User = [System.Uri]::UnescapeDataString(($parsed.UserInfo -split ':')[0])
  }
}

# Validate both identities before any database creation or pg_restore --clean.
$target = Get-DatabaseIdentity $env:ISOLATED_RESTORE_DATABASE_URL
$source = Get-DatabaseIdentity $env:DATABASE_URL
$uri = $target.Uri
$targetDb = $target.Database
$dbUser = $target.User
if ([string]::IsNullOrWhiteSpace($dbUser)) { throw 'ISOLATED_RESTORE_DATABASE_URL must include a user (password is never echoed).' }
if ($target.Database -in @('ai_marketing_phase1', 'platform', 'postgres', 'template0', 'template1')) {
  throw 'RESTORE_TARGET_CANONICAL_DATABASE'
}
if ($target.Database -notmatch '(?i)(restore|recovery|acceptance)') {
  throw 'Restore target database name must explicitly identify an isolated restore/recovery database.'
}
if ($target.Host -eq $source.Host -and $target.Port -eq $source.Port -and $target.Database -eq $source.Database) {
  throw 'RESTORE_TARGET_MATCHES_SOURCE_DATABASE'
}
if (-not (Test-Path -LiteralPath $BackupFile)) { throw 'Backup file does not exist.' }

function Resolve-Tool([string]$explicit, [string]$name) {
  if (-not [string]::IsNullOrWhiteSpace($explicit)) {
    if (-not (Test-Path -LiteralPath $explicit)) { throw "$name path is configured but missing." }
    return $explicit
  }
  $onPath = Get-Command $name -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  return $null
}
$pgRestore = Resolve-Tool $env:PG_RESTORE_PATH 'pg_restore'
$dockerContainer = $env:PG_DOCKER_CONTAINER
$mode = if ($pgRestore) { 'host-binaries' } elseif (-not [string]::IsNullOrWhiteSpace($dockerContainer)) { 'docker-exec' } else { throw 'No pg_restore available. Install PostgreSQL 16 client tools or set PG_DOCKER_CONTAINER for a local drill.' }

# Structural pre-flight: refuse to copy/restore an artifact pg_restore cannot parse.
if ($mode -eq 'host-binaries') {
  $list = & $pgRestore --list $BackupFile
  if ($LASTEXITCODE -ne 0 -or -not $list -or $list.Count -lt 10) { throw 'BACKUP_ARTIFACT_UNREADABLE' }
}

if ($mode -eq 'host-binaries') {
  if ($CreateDatabase) {
    $psql = Resolve-Tool $env:PG_PSQL_PATH 'psql'
    if (-not $psql) { throw 'CreateDatabase requires psql (PG_PSQL_PATH or PATH) in host-binaries mode.' }
    $builder = [System.UriBuilder]$uri
    $builder.Path = '/postgres'
    $exists = & $psql $builder.Uri.AbsoluteUri -tAc "SELECT 1 FROM pg_database WHERE datname = '$targetDb'"
    if ($LASTEXITCODE -ne 0) { throw 'RESTORE_TARGET_PROBE_FAILED' }
    if ($exists -ne '1') {
      & $psql $builder.Uri.AbsoluteUri -c "CREATE DATABASE `"$targetDb`""
      if ($LASTEXITCODE -ne 0) { throw 'RESTORE_TARGET_CREATE_FAILED' }
    }
  }
  & $pgRestore --exit-on-error --clean --if-exists --no-owner --no-privileges --dbname=$env:ISOLATED_RESTORE_DATABASE_URL $BackupFile
  if ($LASTEXITCODE -ne 0) { throw 'Isolated restore failed.' }
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

Write-Output (ConvertTo-Json -Compress @{
    status = 'restored'
    target = 'isolated'
    database = $targetDb
    mode = $mode
    nextStep = 'Provision roles (provision:production-roles), then run packages/db restore:verify and production:verify against the isolated URL before any cutover.'
  })
