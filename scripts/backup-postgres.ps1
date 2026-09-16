param([Parameter(Mandatory=$true)][string]$BackupOutputDirectory)
$ErrorActionPreference = 'Stop'
if ($env:NAWA_BACKUP_CONFIRM -ne 'YES') { throw 'Set NAWA_BACKUP_CONFIRM=YES after approved backup operation.' }
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'DATABASE_URL is required but is never printed.' }
if ([string]::IsNullOrWhiteSpace($env:PG_DUMP_PATH) -or [string]::IsNullOrWhiteSpace($env:PG_RESTORE_PATH)) { throw 'PG_DUMP_PATH and PG_RESTORE_PATH must reference approved PostgreSQL tools.' }
$target = [IO.Path]::GetFullPath($BackupOutputDirectory)
New-Item -ItemType Directory -Force -Path $target | Out-Null
$file = Join-Path $target ("nawa-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
& $env:PG_DUMP_PATH --format=custom --no-owner --no-privileges --file=$file $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) { throw 'Backup failed.' }
& $env:PG_RESTORE_PATH --list $file | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Backup verification failed.' }
Write-Output (ConvertTo-Json @{ status='verified'; backupFile=$file })
