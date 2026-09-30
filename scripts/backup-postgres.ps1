param([Parameter(Mandatory=$true)][string]$BackupOutputDirectory, [string]$Label = '')
# WS-PROD-03 production-capable logical backup.
#
# Tool resolution order (first match wins):
#   1. PG_DUMP_PATH / PG_RESTORE_PATH environment variables (production hosts)
#   2. pg_dump / pg_restore on PATH
#   3. PG_DOCKER_CONTAINER docker exec (LOCAL DRILL ONLY - Growth OS container)
#
# DATABASE_URL is consumed but never printed. The artifact and manifest contain
# no credentials: database name and host only.
$ErrorActionPreference = 'Stop'
if ($env:NAWA_BACKUP_CONFIRM -ne 'YES') { throw 'Set NAWA_BACKUP_CONFIRM=YES after approved backup operation.' }
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL) -and [string]::IsNullOrWhiteSpace($env:DATABASE_URL_FILE)) {
  throw 'DATABASE_URL or DATABASE_URL_FILE is required.'
}
Import-Module (Join-Path $PSScriptRoot 'postgres-cli.psm1') -Force

$identity = Get-PostgresConnectionMetadata -ConnectionEnvironment 'DATABASE_URL'
$database = $identity.database
if ([string]::IsNullOrWhiteSpace($database) -or $database -notmatch '^[A-Za-z0-9_]+$') { throw 'DATABASE_URL must end in a simple database name.' }
$dbUser = $identity.username
if ([string]::IsNullOrWhiteSpace($dbUser)) { throw 'DATABASE_URL must include a user (password is never echoed).' }

function Resolve-Tool([string]$explicit, [string]$name) {
  if (-not [string]::IsNullOrWhiteSpace($explicit)) {
    if (-not (Test-Path -LiteralPath $explicit)) { throw "$name path is configured but missing." }
    return $explicit
  }
  $onPath = Get-Command $name -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  return $null
}
$pgDump = Resolve-Tool $env:PG_DUMP_PATH 'pg_dump'
$pgRestore = Resolve-Tool $env:PG_RESTORE_PATH 'pg_restore'
$dockerContainer = $env:PG_DOCKER_CONTAINER
$mode = if ($pgDump -and $pgRestore) { 'host-binaries' } elseif (-not [string]::IsNullOrWhiteSpace($dockerContainer)) { 'docker-exec' } else { throw 'No pg_dump/pg_restore available. Install PostgreSQL 16 client tools or set PG_DOCKER_CONTAINER for a local drill.' }

$target = [IO.Path]::GetFullPath($BackupOutputDirectory)
New-Item -ItemType Directory -Force -Path $target | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$labelPart = if ([string]::IsNullOrWhiteSpace($Label)) { '' } else { '-' + ($Label -replace '[^A-Za-z0-9_-]', '') }
$fileName = "nawa-backup-$database-$timestamp$labelPart.dump"
$file = Join-Path $target $fileName
$containerTmp = "/tmp/$fileName"
$version = $null

try {
  if ($mode -eq 'host-binaries') {
    $version = (& $pgDump --version) -join ' '
    $dump = Invoke-PostgresTool -Tool $pgDump -ConnectionEnvironment 'DATABASE_URL' `
      -ToolArguments @('--format=custom', '--no-owner', '--no-privileges', "--file=$file")
    if ($dump.ExitCode -ne 0) { throw 'BACKUP_COMMAND_FAILED' }
    $list = & $pgRestore --list $file
    if ($LASTEXITCODE -ne 0 -or -not $list -or $list.Count -lt 10) { throw 'BACKUP_STRUCTURAL_VALIDATION_FAILED' }
  } else {
    $version = (docker exec $dockerContainer pg_dump --version) -join ' '
    if ($LASTEXITCODE -ne 0) { throw "Docker container unavailable for drill backup." }
    docker exec $dockerContainer pg_dump -U $dbUser -d $database --format=custom --no-owner --no-privileges --file=$containerTmp
    if ($LASTEXITCODE -ne 0) { throw 'BACKUP_COMMAND_FAILED' }
    $list = docker exec $dockerContainer pg_restore --list $containerTmp
    if ($LASTEXITCODE -ne 0 -or -not $list -or $list.Count -lt 10) { throw 'BACKUP_STRUCTURAL_VALIDATION_FAILED' }
    docker cp "${dockerContainer}:$containerTmp" $file
    if ($LASTEXITCODE -ne 0) { throw 'BACKUP_ARTIFACT_EXPORT_FAILED' }
  }
} finally {
  if ($mode -eq 'docker-exec') { docker exec $dockerContainer rm -f $containerTmp 2>$null | Out-Null }
}
if (-not (Test-Path -LiteralPath $file)) { throw 'BACKUP_ARTIFACT_MISSING' }

$sizeBytes = (Get-Item -LiteralPath $file).Length
if ($sizeBytes -lt 1024) { throw 'BACKUP_ARTIFACT_SUSPICIOUSLY_SMALL' }
$sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = @{
  status = 'verified'
  timestampUtc = (Get-Date).ToUniversalTime().ToString('o')
  database = $database
  host = $identity.host
  backupFile = $file
  sizeBytes = $sizeBytes
  sha256 = $sha256
  pgDumpVersion = $version
  mode = $mode
  format = 'custom (pg_dump -Fc)'
  noOwner = $true
  noPrivileges = $true
}
$manifestPath = "$file.manifest.json"
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Write-Output (ConvertTo-Json -Compress @{ status = 'verified'; backupFile = $file; manifest = $manifestPath; sizeBytes = $sizeBytes; sha256 = $sha256 })
