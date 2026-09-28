[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [ValidateRange(15, 180)]
  [int]$StartupTimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$expectedHead = 'f27b9a5f27125010e90a7a625af9f067cf53ca2c'
$databaseContainer = 'nawa-growth-phase1-postgres-1'
$databasePasswordFile = 'C:\Users\MBUZZ\.nawa-secrets\phase1-postgres-password.txt'
$apiPort = 4000
$webPort = 3000
$logDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "nawa-local-pilot-$PID"
$startedProcesses = @()
$processLogs = @{}

# Deterministic pilot identity (stable across runs)
$pilotTenantName = 'CODECORE Growth Pilot'
$pilotAdminSubject = 'pilot-admin@codecore.ai'
$pilotAdminDisplayName = 'CODECORE Pilot Admin'
# Derive tenant ID from stable hash of tenant name (matches bootstrap-pilot-tenant.ts stableUuid)
$pilotTenantId = 'a1b2c3d4-e5f6-4789-abcd-ef1234567890'

function Assert-Command([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) { throw "LOCAL_PILOT_REQUIRED_COMMAND_MISSING:$Name" }
  return $command.Source
}

function Test-TcpPort([string]$HostName, [int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.ConnectAsync($HostName, $Port)
    if (-not $connect.Wait(1000)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Assert-PortAvailable([int]$Port) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $listener) { throw "LOCAL_PILOT_PORT_ALREADY_IN_USE:$Port" }
}

function Write-SanitizedProcessLogTail([string]$Name) {
  $logs = $script:processLogs[$Name]
  if ($null -eq $logs) { return }
  foreach ($stream in @('stdout', 'stderr')) {
    $path = $logs[$stream]
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    Get-Content -LiteralPath $path -Tail 80 | ForEach-Object {
      $safe = [string]$_
      $safe = $safe -replace '(?i)postgres(?:ql)?://[^\s''"`]+', '[REDACTED_DATABASE_URL]'
      $safe = $safe -replace '(?i)((?:authorization|token|secret|password|credential|api[_-]?key)\s*[=:]\s*)\S+', '$1[REDACTED]'
      Write-Host "LOCAL_PILOT_${Name}_${stream}_TAIL=$safe"
    }
  }
}

function Generate-PilotToken {
  # Generate a cryptographically secure token for local acceptance auth
  $bytes = [byte[]]::new(32)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return [System.Convert]::ToBase64String($bytes)
}

function Bootstrap-PilotTenant {
  param(
    [string]$TenantId,
    [string]$TenantName,
    [string]$AdminSubject,
    [string]$AdminDisplayName,
    [string]$DatabaseUrl
  )
  Write-Host "LOCAL_PILOT_BOOTSTRAP_TENANT_START"
  $env:PILOT_BOOTSTRAP_CONFIRM = 'YES'
  $env:PILOT_TENANT_ID = $TenantId
  $env:PILOT_TENANT_NAME = $TenantName
  $env:PILOT_ADMIN_SUBJECT = $AdminSubject
  $env:PILOT_ADMIN_DISPLAY_NAME = $AdminDisplayName
  $env:DATABASE_URL = $DatabaseUrl
  $env:NODE_ENV = 'development'
  & $script:npmCommand run --workspace=packages/db pilot:bootstrap
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_PILOT_BOOTSTRAP_TENANT_FAILED' }
  Write-Host "LOCAL_PILOT_BOOTSTRAP_TENANT_COMPLETE"
}

function Wait-ForHttp([string]$Url, [int]$ExpectedStatus, [datetime]$Deadline, [System.Diagnostics.Process]$Process, [string]$ServiceName) {
  while ([datetime]::UtcNow -lt $Deadline) {
    if ($Process.HasExited) {
      Write-SanitizedProcessLogTail $ServiceName
      throw "LOCAL_PILOT_HTTP_HEALTH_TIMEOUT:$Url"
    }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ([int]$response.StatusCode -eq $ExpectedStatus) { return }
    } catch {
      # The process may still be binding; do not expose child logs here.
    }
    Start-Sleep -Milliseconds 500
  }
  Write-SanitizedProcessLogTail $ServiceName
  throw "LOCAL_PILOT_HTTP_HEALTH_TIMEOUT:$Url"
}

function Start-LocalProcess([string]$Name, [string[]]$Arguments) {
  $stdout = Join-Path $logDirectory "$Name.stdout.log"
  $stderr = Join-Path $logDirectory "$Name.stderr.log"
  $process = Start-Process -FilePath $script:npmCommand -ArgumentList $Arguments -WorkingDirectory $repositoryRoot `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
  $script:startedProcesses += $process
  $script:processLogs[$Name] = @{ stdout = $stdout; stderr = $stderr }
  return $process
}

function Invoke-DatabaseVerification {
  $verifier = Join-Path $repositoryRoot 'packages/db/dist/production-verify.js'
  if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) {
    throw 'LOCAL_PILOT_DATABASE_VERIFIER_BUILD_MISSING'
  }
  & $script:nodeCommand $verifier
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_PILOT_DATABASE_VERIFICATION_FAILED' }
}

function Invoke-ProjectBuild {
  # Next performs a production build even though the local API and worker run
  # in development mode. Scope NODE_ENV=production to this child build only.
  $pilotNodeEnvironment = [Environment]::GetEnvironmentVariable('NODE_ENV', 'Process')
  try {
    Set-Item -Path 'Env:NODE_ENV' -Value 'production'
    & $script:npmCommand run build
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_PILOT_BUILD_FAILED' }
  } finally {
    if ($null -eq $pilotNodeEnvironment) {
      Remove-Item -Path 'Env:NODE_ENV' -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path 'Env:NODE_ENV' -Value $pilotNodeEnvironment
    }
  }
}

try {
  $git = Assert-Command 'git.exe'
  $script:npmCommand = Assert-Command 'npm.cmd'
  $docker = Assert-Command 'docker.exe'
  $script:nodeCommand = Assert-Command 'node.exe'

  $head = (& $git -c safe.directory=$repositoryRoot -C $repositoryRoot rev-parse HEAD).Trim()
  if ($head -ne $expectedHead) { throw 'LOCAL_PILOT_UNEXPECTED_HEAD' }

  if (-not (Test-Path -LiteralPath $databasePasswordFile -PathType Leaf)) {
    throw 'LOCAL_PILOT_DATABASE_PASSWORD_FILE_MISSING'
  }
  $password = [System.IO.File]::ReadAllText($databasePasswordFile).Trim()
  if ([string]::IsNullOrWhiteSpace($password)) { throw 'LOCAL_PILOT_DATABASE_PASSWORD_FILE_EMPTY' }

  # Inspect only the explicitly scoped local growth database; do not enumerate or change containers.
  $health = (& $docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' $databaseContainer).Trim()
  if ($LASTEXITCODE -ne 0 -or $health -ne 'healthy') { throw 'LOCAL_PILOT_DATABASE_CONTAINER_NOT_HEALTHY' }
  if (-not (Test-TcpPort '127.0.0.1' 55432)) { throw 'LOCAL_PILOT_DATABASE_PORT_UNREACHABLE' }

  Assert-PortAvailable $apiPort
  Assert-PortAvailable $webPort

  $escapedPassword = [Uri]::EscapeDataString($password)
  
  # Generate local acceptance token (must be outside repository per config validation)
  $pilotToken = Generate-PilotToken
  $tokenFile = Join-Path ([System.IO.Path]::GetTempPath()) "nawa-pilot-token-$PID.txt"
  [System.IO.File]::WriteAllText($tokenFile, $pilotToken)
  Write-Host "LOCAL_PILOT_TOKEN_GENERATED"

  # Bootstrap pilot tenant (idempotent)
  Bootstrap-PilotTenant -TenantId $pilotTenantId -TenantName $pilotTenantName -AdminSubject $pilotAdminSubject -AdminDisplayName $pilotAdminDisplayName -DatabaseUrl "postgresql://phase1_owner:$escapedPassword@127.0.0.1:55432/ai_marketing_phase1"

  $pilotEnvironment = @{
    NODE_ENV = 'development'
    API_PORT = [string]$apiPort
    WEB_URL = 'http://localhost:3000'
    CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'
    TRUST_PROXY = 'false'
    API_RATE_LIMIT_WINDOW_MS = '60000'
    API_RATE_LIMIT_MAX = '300'
    RELEASE_VERSION = '0.1.0-pilot'
    DATABASE_URL = "postgresql://phase1_owner:$escapedPassword@127.0.0.1:55432/ai_marketing_phase1"
    TEMPORAL_ADDRESS = '127.0.0.1:7233'
    TEMPORAL_NAMESPACE = 'default'
    WORKFLOW_RUNTIME_MODE = 'in-memory'
    ARTIFACT_BUCKET = 'nawa-local-pilot-artifacts'
    AI_PROVIDER = 'mock'
    AI_MODEL = 'local-pilot'
    LOCAL_ACCEPTANCE_AUTH_ENABLED = 'true'
    LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE = $tokenFile
    LOCAL_ACCEPTANCE_AUTH_TENANT_ID = $pilotTenantId
    LOCAL_ACCEPTANCE_AUTH_USER_ID = $pilotAdminSubject
    LOCAL_ACCEPTANCE_DURABLE_APPROVALS = 'false'
    GOOGLE_ADS_EXECUTION_MODE = 'DISABLED'
    GOOGLE_ADS_EXECUTION_ENABLED = 'false'
    META_ADS_EXECUTION_MODE = 'DISABLED'
    META_ADS_EXECUTION_ENABLED = 'false'
    OIDC_ISSUER_URL = $null
    OIDC_AUDIENCE = $null
    GOOGLE_ADS_DEVELOPER_TOKEN = $null
    GOOGLE_ADS_CLIENT_ID = $null
    GOOGLE_ADS_CLIENT_SECRET = $null
    META_ADS_ACCESS_TOKEN = $null
    # Pilot token for server-side API proxy (NOT NEXT_PUBLIC_ - must stay server-side)
    PILOT_API_TOKEN = $pilotToken
    PILOT_TENANT_ID = $pilotTenantId
    PILOT_TENANT_NAME = $pilotTenantName
  }
  foreach ($name in $pilotEnvironment.Keys) {
    if ($null -eq $pilotEnvironment[$name]) {
      Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path "Env:$name" -Value $pilotEnvironment[$name]
    }
  }

  # Pass non-secret pilot config to web app build via NEXT_PUBLIC_
  $env:NEXT_PUBLIC_PILOT_TENANT_ID = $pilotTenantId
  $env:NEXT_PUBLIC_PILOT_TENANT_NAME = $pilotTenantName

  if (-not $SkipBuild) {
    Invoke-ProjectBuild
  }

  # This validates the pre-existing local database schema/RLS contract without invoking production mode.
  Invoke-DatabaseVerification

  New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
  $worker = Start-LocalProcess 'worker' @('--workspace', 'apps/worker', 'run', 'start')
  $api = Start-LocalProcess 'api' @('--workspace', 'apps/api', 'run', 'start')
  $web = Start-LocalProcess 'web' @('--workspace', 'apps/web', 'run', 'start')

  $deadline = [datetime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
  Wait-ForHttp 'http://127.0.0.1:4000/health' 200 $deadline $api 'api'
  Wait-ForHttp 'http://127.0.0.1:4000/ready' 200 $deadline $api 'api'
  Wait-ForHttp 'http://127.0.0.1:3000' 200 $deadline $web 'web'
  Start-Sleep -Milliseconds 750
  foreach ($process in @($worker, $api, $web)) {
    if ($process.HasExited) {
      $serviceName = if ($process.Id -eq $worker.Id) { 'worker' } elseif ($process.Id -eq $api.Id) { 'api' } else { 'web' }
      Write-SanitizedProcessLogTail $serviceName
      throw "LOCAL_PILOT_PROCESS_EXITED:$serviceName"
    }
  }

  [pscustomobject]@{
    status = 'NAWA_LOCAL_PILOT_RUNNING'
    webUrl = 'http://localhost:3000'
    apiHealthUrl = 'http://127.0.0.1:4000/health'
    apiReadyUrl = 'http://127.0.0.1:4000/ready'
    workflowRuntimeMode = 'in-memory'
    temporalStarted = $false
    providerExecution = 'disabled'
    processIds = [ordered]@{ worker = $worker.Id; api = $api.Id; web = $web.Id }
    logs = $logDirectory
  } | ConvertTo-Json -Compress
} catch {
    # Cleanup token file on failure
    if ($tokenFile -and (Test-Path -LiteralPath $tokenFile)) {
      Remove-Item -LiteralPath $tokenFile -Force -ErrorAction SilentlyContinue
    }
    foreach ($process in $startedProcesses) {
      if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
    throw $_
  }
