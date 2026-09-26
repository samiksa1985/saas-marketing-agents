param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference = 'Stop'
if ($env:NAWA_ISOLATED_RESTORE_CONFIRM -ne 'YES') { throw 'Set NAWA_ISOLATED_RESTORE_CONFIRM=YES only for an isolated restore target.' }
if ([string]::IsNullOrWhiteSpace($env:ISOLATED_RESTORE_DATABASE_URL)) { throw 'ISOLATED_RESTORE_DATABASE_URL is required and is never printed.' }
if ($env:ISOLATED_RESTORE_DATABASE_URL -eq $env:DATABASE_URL) { throw 'Restore target must not equal DATABASE_URL.' }
if ($env:ISOLATED_RESTORE_DATABASE_URL -notmatch '(?i)(restore|recovery|acceptance)') { throw 'Restore target name must explicitly identify an isolated restore/recovery database.' }
if (-not (Test-Path -LiteralPath $BackupFile)) { throw 'Backup file does not exist.' }
& $env:PG_RESTORE_PATH --clean --if-exists --no-owner --no-privileges --dbname=$env:ISOLATED_RESTORE_DATABASE_URL $BackupFile
if ($LASTEXITCODE -ne 0) { throw 'Isolated restore failed.' }
Write-Output (ConvertTo-Json @{ status='restored'; target='isolated' })
