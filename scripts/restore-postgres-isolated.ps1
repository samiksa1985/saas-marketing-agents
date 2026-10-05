param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [switch]$CreateDatabase
)
# WS-PROD-03 isolated restore with WAVE-AB P0 canonical identity proof.
# Destructive steps (CREATE/DROP/pg_restore --clean) run ONLY after the live
# server identity behind BOTH URLs has been probed and compared, and — in
# docker-exec drill mode — the configured container has been proven to
# represent the same server the target URL reaches.
# URLs are consumed but never printed; passwords never enter argv/output.
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
  if ($h -in @('localhost', '127.0.0.1', '::1', '0.0.0.0', '::')) { return 'localhost' }
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

# Live server identity = listening address + port + data directory + cluster
# start time. Two URLs that merely spell different hostnames for the same
# server resolve to the SAME identity and are treated as the same server.
$script:ServerIdentityQuery = "SELECT COALESCE(inet_server_addr()::text, 'local') || ':' || COALESCE(inet_server_port()::text, '0') || '|' || current_setting('data_directory') || '|' || pg_postmaster_start_time()::text"

function Invoke-PsqlProbe([string]$connectionEnvironment, [string]$sql, [string]$database) {
  $psql = Resolve-Tool $env:PG_PSQL_PATH 'psql'
  if ($psql) {
    return Invoke-PostgresTool -Tool $psql -ConnectionEnvironment $connectionEnvironment `
      -Database $database -ToolArguments @('-tAc', $sql) -CaptureOutput
  }
  # Fallback for the LOCAL drill only: run psql inside the container whose
  # port binding is later proven to match the target URL. The server-level
  # identity query may run as the cluster bootstrap superuser; database-level
  # probes still run as the target URL's user so privileges are not hidden.
  if ([string]::IsNullOrWhiteSpace($env:PG_DOCKER_CONTAINER)) {
    throw 'Identity verification requires psql (PG_PSQL_PATH or PATH) or PG_DOCKER_CONTAINER.'
  }
  $identity = Get-DatabaseIdentity $connectionEnvironment
  $output = $null
  $exitCode = 1
  try {
    $output = docker exec $env:PG_DOCKER_CONTAINER psql -U $identity.User -d $database -tAc $sql 2>$null
    $exitCode = $LASTEXITCODE
  } catch {
    $exitCode = 1
  }
  if ($exitCode -ne 0 -and $sql -eq $script:ServerIdentityQuery) {
    # Server identity is topology, not data: probing it as the local drill
    # cluster's bootstrap superuser does not grant the restore any privilege.
    try {
      $output = docker exec $env:PG_DOCKER_CONTAINER psql -U phase1_owner -d $database -tAc $sql
      $exitCode = $LASTEXITCODE
    } catch {
      $exitCode = 1
    }
  }
  if ($null -eq $output) { $output = @() }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = ($output -join "`n").Trim() }
}

function Get-LiveServerIdentity([string]$connectionEnvironment) {
  $probe = Invoke-PsqlProbe $connectionEnvironment $script:ServerIdentityQuery 'postgres'
  if ($probe.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($probe.Output)) {
    throw 'RESTORE_SERVER_IDENTITY_PROBE_FAILED'
  }
  return $probe.Output.Trim()
}

function Test-DockerContainerMatchesTarget($targetIdentity, [string]$dockerContainer) {
  # The container must resolve to the same normalized host:port the target URL
  # names. Otherwise docker exec could silently operate on a different server.
  if ([string]::IsNullOrWhiteSpace($dockerContainer)) { return $false }
  $inspect = docker inspect $dockerContainer 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $inspect) { return $false }
  $hostPort = (docker port $dockerContainer '5432/tcp' 2>$null) -join "`n"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($hostPort)) { return $false }
  $normalizedTargetHost = Get-NormalizedHostName $targetIdentity.HostName
  if ($normalizedTargetHost -ne 'localhost') { return $false }
  foreach ($binding in ($hostPort -split "`r?`n")) {
    if ($binding -match '^\S+:(\d+)$' -and [int]$Matches[1] -eq $targetIdentity.Port) { return $true }
  }
  return $false
}

# Validate identities before any database creation or pg_restore --clean.
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

$pgRestore = Resolve-Tool $env:PG_RESTORE_PATH 'pg_restore'
$dockerContainer = $env:PG_DOCKER_CONTAINER
$mode = if ($pgRestore) { 'host-binaries' } elseif (-not [string]::IsNullOrWhiteSpace($dockerContainer)) { 'docker-exec' } else { throw 'No pg_restore available. Install PostgreSQL 16 client tools or set PG_DOCKER_CONTAINER for a local drill.' }

# P0: live server identity proof for BOTH sides before anything destructive —
# including before the backup artifact is even opened.
$sourceServer = Get-LiveServerIdentity 'DATABASE_URL'
$targetServer = Get-LiveServerIdentity 'ISOLATED_RESTORE_DATABASE_URL'

if ($sourceServer -eq $targetServer -and $target.Database -eq $source.Database) {
  throw 'RESTORE_TARGET_MATCHES_SOURCE_DATABASE'
}
# Alias guard: same live server + a canonical-looking target database name can
# never masquerade as isolated merely because the URL spelled another host.
if ($sourceServer -eq $targetServer -and $target.Database -in @('ai_marketing_phase1', 'platform')) {
  throw 'RESTORE_TARGET_CANONICAL_DATABASE'
}

if (-not (Test-Path -LiteralPath $BackupFile)) { throw 'Backup file does not exist.' }

# Container binding: in docker-exec mode, fail closed unless the container can
# be proven to be the server the verified target URL reaches.
if ($mode -eq 'docker-exec' -and -not (Test-DockerContainerMatchesTarget $target $dockerContainer)) {
  throw 'RESTORE_DOCKER_CONTAINER_IDENTITY_UNPROVEN'
}

# Non-destructive target existence/database proof.
$targetExists = Invoke-PsqlProbe 'ISOLATED_RESTORE_DATABASE_URL' "SELECT 1 FROM pg_database WHERE datname = '$targetDb'" 'postgres'
if ($targetExists.ExitCode -ne 0) { throw 'RESTORE_TARGET_IDENTITY_PROBE_FAILED' }
if ($CreateDatabase) {
  if ($targetExists.Output -eq '1') { throw 'RESTORE_TARGET_DATABASE_ALREADY_EXISTS' }
} else {
  if ($targetExists.Output -ne '1') { throw 'RESTORE_TARGET_DATABASE_MISSING' }
  $databaseProbe = Invoke-PsqlProbe 'ISOLATED_RESTORE_DATABASE_URL' 'SELECT current_database()' $targetDb
  if ($databaseProbe.ExitCode -ne 0) { throw 'RESTORE_TARGET_IDENTITY_PROBE_FAILED' }
  if ($databaseProbe.Output -ne $targetDb) { throw 'RESTORE_TARGET_IDENTITY_DATABASE_MISMATCH' }
}

# Structural pre-flight: refuse to copy/restore an artifact pg_restore cannot parse.
if ($mode -eq 'host-binaries') {
  $list = & $pgRestore --list $BackupFile
  if ($LASTEXITCODE -ne 0 -or -not $list -or $list.Count -lt 10) { throw 'BACKUP_ARTIFACT_UNREADABLE' }
}

if ($mode -eq 'host-binaries') {
  if ($CreateDatabase) {
    $psql = Resolve-Tool $env:PG_PSQL_PATH 'psql'
    if (-not $psql) { throw 'CreateDatabase requires psql (PG_PSQL_PATH or PATH) in host-binaries mode.' }
    $create = Invoke-PsqlProbe 'ISOLATED_RESTORE_DATABASE_URL' "CREATE DATABASE `"$targetDb`"" 'postgres'
    if ($create.ExitCode -ne 0) { throw 'RESTORE_TARGET_CREATE_FAILED' }
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

$restoredIdentity = Invoke-PsqlProbe 'ISOLATED_RESTORE_DATABASE_URL' 'SELECT current_database()' $targetDb
if ($restoredIdentity.ExitCode -ne 0) { throw 'RESTORE_TARGET_IDENTITY_PROBE_FAILED' }
if ($restoredIdentity.Output -ne $targetDb) { throw 'RESTORE_TARGET_IDENTITY_DATABASE_MISMATCH' }

Write-Output (ConvertTo-Json -Compress @{
    status = 'restored'
    target = 'isolated'
    database = $targetDb
    mode = $mode
    nextStep = 'Provision roles (provision:production-roles), then run packages/db restore:verify and production:verify against the isolated URL before any cutover.'
  })
