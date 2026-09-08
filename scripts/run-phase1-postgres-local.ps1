[CmdletBinding()]
param(
  [switch]$KeepRunning,
  [ValidateRange(1024, 65535)]
  [int]$Port = 55432
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
$composeFile = Join-Path $repositoryRoot 'infra/docker/docker-compose.phase1.yml'
$evidenceDirectory = Join-Path $repositoryRoot 'artifacts/phase1-postgres'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $evidenceDirectory "phase1-$timestamp.log"
$resultFile = Join-Path $evidenceDirectory "phase1-$timestamp.result.json"
$stdoutFile = Join-Path $evidenceDirectory "phase1-$timestamp.stdout.log"
$stderrFile = Join-Path $evidenceDirectory "phase1-$timestamp.stderr.log"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Assert-Phase1PassResult([object]$result) {
  if ($result.status -ne 'PASS') { throw "Phase 1 harness reported status: $($result.status)" }
  if (-not $result.checks) { throw 'Phase 1 harness PASS did not include the required checks object.' }
}

Require-Command docker
Require-Command npm
if (-not (Test-Path -LiteralPath $composeFile)) { throw "Compose file not found: $composeFile" }

# This does not change a database; it only proves the local Docker daemon is reachable.
& docker info | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker daemon is not reachable from this terminal.' }

New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$phasePassword = "p1$([guid]::NewGuid().ToString('N'))!Aa"
$escapedPassword = [Uri]::EscapeDataString($phasePassword)
$databaseName = 'ai_marketing_phase1'

$env:PHASE1_POSTGRES_USER = 'phase1_owner'
$env:PHASE1_POSTGRES_PASSWORD = $phasePassword
$env:PHASE1_POSTGRES_DB = $databaseName
$env:PHASE1_POSTGRES_PORT = [string]$Port
$env:PHASE1_CONFIRM_DISPOSABLE = 'YES'
$env:PHASE1_DATABASE_URL = "postgresql://phase1_owner:$escapedPassword@localhost:$Port/$databaseName"
$env:PHASE1_ADMIN_DATABASE_URL = "postgresql://phase1_owner:$escapedPassword@localhost:$Port/postgres"

try {
  Push-Location $repositoryRoot
  try {
    & docker compose -f $composeFile up -d
    if ($LASTEXITCODE -ne 0) { throw 'Failed to start the disposable Phase 1 PostgreSQL compose service.' }

    $containerId = (& docker compose -f $composeFile ps -q postgres).Trim()
    if (-not $containerId) { throw 'Phase 1 PostgreSQL container ID was not returned.' }
    $ready = $false
    foreach ($attempt in 1..60) {
      $health = (& docker inspect --format '{{.State.Health.Status}}' $containerId).Trim()
      if ($health -eq 'healthy') { $ready = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $ready) {
      & docker compose -f $composeFile logs postgres
      throw 'Disposable Phase 1 PostgreSQL did not become healthy.'
    }

    $npmPath = (Get-Command npm).Source
    if ([System.IO.Path]::GetExtension($npmPath) -ieq '.ps1') {
      $npmPath = Join-Path (Split-Path -Parent $npmPath) 'npm.cmd'
    }
    if (-not (Test-Path -LiteralPath $npmPath -PathType Leaf)) {
      throw 'The npm executable path could not be resolved.'
    }
    $process = Start-Process -FilePath $npmPath -ArgumentList @('--workspace', '@platform/db', 'run', 'phase1:postgres') `
      -WorkingDirectory $repositoryRoot -NoNewWindow -PassThru -Wait `
      -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
    $transcript = @()
    if (Test-Path -LiteralPath $stdoutFile) { $transcript += Get-Content -LiteralPath $stdoutFile }
    if (Test-Path -LiteralPath $stderrFile) { $transcript += Get-Content -LiteralPath $stderrFile }
    [System.IO.File]::WriteAllLines($logFile, [string[]]$transcript, [System.Text.UTF8Encoding]::new($false))
    $transcript | ForEach-Object { Write-Host $_ }
    $harnessExitCode = $process.ExitCode
    try {
      $result = Get-Phase1HarnessResultFromLog $logFile
    } catch {
      if ($harnessExitCode -eq 0) { throw }
      # A non-zero harness exit must still leave a machine-readable FAIL record.
      $result = [pscustomobject]@{
        status = 'FAIL'
        timestamp = [DateTime]::UtcNow.ToString('o')
        error = 'Harness exited without a readable PHASE1_POSTGRES_RESULT.'
        exitCode = $harnessExitCode
      }
    }
    Save-Phase1EvidenceResult $result $resultFile
    Write-Host "PHASE1_EVIDENCE_LOG=$logFile"
    Write-Host "PHASE1_EVIDENCE_RESULT=$resultFile"
    if ($harnessExitCode -ne 0) { throw "Phase 1 harness exited with code $harnessExitCode." }
    Assert-Phase1PassResult $result
    Write-Host 'PHASE1_LOCAL_RUNNER=PASS'
  } finally {
    Pop-Location
  }
} finally {
  if (-not $KeepRunning) {
    & docker compose -f $composeFile down -v | Out-Host
  }
  Remove-Item Env:PHASE1_POSTGRES_USER, Env:PHASE1_POSTGRES_PASSWORD, Env:PHASE1_POSTGRES_DB -ErrorAction SilentlyContinue
  Remove-Item Env:PHASE1_POSTGRES_PORT, Env:PHASE1_CONFIRM_DISPOSABLE, Env:PHASE1_DATABASE_URL, Env:PHASE1_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
}
