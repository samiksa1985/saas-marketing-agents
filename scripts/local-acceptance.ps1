[CmdletBinding()]
param(
  [switch]$KeepApiRunning,
  [switch]$ReuseExistingApi,
  [ValidateRange(1, 300)]
  [int]$StartupTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http -ErrorAction Stop

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$passwordFile = 'C:\Users\MBUZZ\.nawa-secrets\phase1-postgres-password.txt'
$tokenFile = 'C:\Users\MBUZZ\.nawa-secrets\local-acceptance-auth-token.txt'
$apiPort = 4000
$logDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "nawa-local-acceptance-$PID"
$serverStdout = Join-Path $logDirectory 'api.stdout.log'
$serverStderr = Join-Path $logDirectory 'api.stderr.log'
$probeStdout = Join-Path $logDirectory 'postgres.stdout.log'
$probeStderr = Join-Path $logDirectory 'postgres.stderr.log'

$summary = [ordered]@{
  POSTGRES_READY = 'NOT_RUN'
  API_LISTENING = 'False'
  AGENTS_HTTP = 'NOT_RUN'
  WORKSTREAMS_HTTP = 'NOT_RUN'
  POLICY_HTTP = 'NOT_RUN'
  AGENT_COUNT = 'NOT_RUN'
  RUNTIME_ACCEPTANCE = 'FAIL'
}

function Require-File([string]$Path, [string]$FailureCode) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw $FailureCode
  }
}

function Restore-Environment([hashtable]$Original) {
  foreach ($name in $Original.Keys) {
    $value = $Original[$name]
    if ($null -eq $value) {
      Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

function Set-ProcessEnvironment([hashtable]$Values) {
  $original = @{}
  foreach ($name in $Values.Keys) {
    $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    $value = $Values[$name]
    if ($null -eq $value) {
      Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
  return $original
}

function Test-TcpPort([string]$HostName, [int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.ConnectAsync($HostName, $Port)
    $completed = $connect.Wait(500)
    if (-not $completed) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Write-SanitizedEvidence([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
  Write-SanitizedText (Get-Content -LiteralPath $Path -Tail 120) 'SERVER_EVIDENCE'
}

function Write-SanitizedText([object]$Text, [string]$Prefix) {
  @($Text) | ForEach-Object {
    if ($null -eq $_ -or [string]::IsNullOrWhiteSpace([string]$_)) { return }
    $line = $_
    $line = $line -replace '(?i)postgres(?:ql)?://[^\s''"`]+', '[REDACTED_DATABASE_URL]'
    $line = $line -replace '(?i)bearer\s+[^\s''"`]+', 'Bearer [REDACTED]'
    Write-Host "$Prefix=$line"
  }
}

function Invoke-PostgresProbe([string]$Stdout, [string]$Stderr) {
  $probe = @'
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
(async () => {
  try {
    await sql.unsafe('SELECT 1');
    await sql.end({ timeout: 5 });
    process.exit(0);
  } catch {
    try { await sql.end({ timeout: 5 }); } catch {}
    process.exit(1);
  }
})();
'@
  & node.exe -e $probe 1> $Stdout 2> $Stderr
  if ($LASTEXITCODE -ne 0) {
    throw 'POSTGRES_PROBE_FAILED'
  }
}

function Invoke-AuthenticatedGet([string]$Uri, [hashtable]$Headers) {
  $client = [System.Net.Http.HttpClient]::new()
  $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $Uri)
  try {
    $client.Timeout = [TimeSpan]::FromSeconds(5)
    foreach ($name in $Headers.Keys) {
      [void]$request.Headers.TryAddWithoutValidation($name, [string]$Headers[$name])
    }
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    try {
      return [pscustomobject]@{
        StatusCode = [int]$response.StatusCode
        Content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      }
    } finally {
      $response.Dispose()
    }
  } finally {
    $request.Dispose()
    $client.Dispose()
  }
}

function Get-JsonArrayCount([string]$Content) {
  $counter = @'
let source = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { source += chunk; });
process.stdin.on('end', () => {
  try {
    const value = JSON.parse(source);
    if (!Array.isArray(value)) process.exit(2);
    process.stdout.write(String(value.length));
  } catch {
    process.exit(3);
  }
});
'@
  $output = @($Content | & node.exe -e $counter)
  if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1 -or $output[0] -notmatch '^\d+$') {
    throw 'AGENTS_RESPONSE_NOT_JSON_ARRAY'
  }
  return [int]$output[0]
}

$apiProcess = $null
$originalEnvironment = @{}
$failure = $null
$httpFailureEvidence = $null

try {
  Require-File $passwordFile 'PHASE1_PASSWORD_FILE_MISSING'
  Require-File $tokenFile 'LOCAL_ACCEPTANCE_TOKEN_FILE_MISSING'
  if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot 'apps/api/src/main.ts') -PathType Leaf)) {
    throw 'API_ENTRYPOINT_MISSING'
  }

  $password = [System.IO.File]::ReadAllText($passwordFile).Trim()
  $token = [System.IO.File]::ReadAllText($tokenFile).Trim()
  if ([string]::IsNullOrWhiteSpace($password)) { throw 'PHASE1_PASSWORD_FILE_EMPTY' }
  if ($token.Length -lt 32) { throw 'LOCAL_ACCEPTANCE_TOKEN_INVALID' }

  $databasePassword = [Uri]::EscapeDataString($password)
  $acceptanceEnvironment = @{
    NODE_ENV = 'development'
    API_PORT = [string]$apiPort
    WEB_URL = 'http://127.0.0.1:3000'
    DATABASE_URL = "postgresql://phase1_owner:$databasePassword@127.0.0.1:55432/ai_marketing_phase1"
    TEMPORAL_ADDRESS = '127.0.0.1:7233'
    TEMPORAL_NAMESPACE = 'default'
    WORKFLOW_RUNTIME_MODE = 'in-memory'
    ARTIFACT_BUCKET = 'nawa-local-acceptance-artifacts'
    ARTIFACT_ENDPOINT = 'http://127.0.0.1:9000'
    AI_PROVIDER = 'mock'
    AI_MODEL = 'local-acceptance'
    LOCAL_ACCEPTANCE_AUTH_ENABLED = 'true'
    LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE = $tokenFile
    LOCAL_ACCEPTANCE_AUTH_TENANT_ID = '00000000-0000-4000-8000-000000000404'
    LOCAL_ACCEPTANCE_AUTH_USER_ID = '00000000-0000-4000-8000-000000000405'
    GOOGLE_ADS_EXECUTION_MODE = 'DISABLED'
    GOOGLE_ADS_EXECUTION_ENABLED = 'false'
    REPOSITORY_ROOT = $repositoryRoot
    OIDC_ISSUER_URL = $null
    OIDC_AUDIENCE = $null
  }
  $originalEnvironment = Set-ProcessEnvironment $acceptanceEnvironment

  New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
  Invoke-PostgresProbe $probeStdout $probeStderr
  $summary.POSTGRES_READY = 'PASS'

  if (Test-TcpPort '127.0.0.1' $apiPort) {
    if (-not $ReuseExistingApi) { throw 'API_PORT_4000_ALREADY_IN_USE' }
    $health = Invoke-AuthenticatedGet "http://127.0.0.1:$apiPort/health" @{}
    if ($health.StatusCode -ne 200) { throw 'EXISTING_API_HEALTH_NOT_200' }
    $summary.API_LISTENING = 'True'
  } else {
    & npm.cmd --workspace '@platform/api' run build
    if ($LASTEXITCODE -ne 0) { throw 'API_BUILD_FAILED' }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $apiProcess = Start-Process -FilePath $node -ArgumentList @('apps/api/dist/main.js') `
      -WorkingDirectory $repositoryRoot -PassThru -RedirectStandardOutput $serverStdout -RedirectStandardError $serverStderr

    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
      if (Test-TcpPort '127.0.0.1' $apiPort) {
        $summary.API_LISTENING = 'True'
        break
      }
      if ($apiProcess.HasExited) { throw 'API_PROCESS_EXITED_BEFORE_LISTENING' }
      Start-Sleep -Milliseconds 500
    }
    if ($summary.API_LISTENING -ne 'True') { throw 'API_STARTUP_TIMEOUT' }
  }

  $headers = @{ Authorization = "Bearer $token" }
  $agents = Invoke-AuthenticatedGet "http://127.0.0.1:$apiPort/agents" $headers
  $summary.AGENTS_HTTP = [string]$agents.StatusCode
  if ($agents.StatusCode -ne 200) {
    $httpFailureEvidence = $agents.Content
    throw 'AGENTS_HTTP_NOT_200'
  }
  $agentCount = Get-JsonArrayCount $agents.Content
  $summary.AGENT_COUNT = [string]$agentCount
  if ($agentCount -ne 71) {
    $rootKind = if ($agents.Content.TrimStart().StartsWith('[')) { 'array' } else { 'object-or-scalar' }
    $httpFailureEvidence = "agents_json_root=$rootKind parsed_items=$agentCount"
    throw 'AGENT_COUNT_MISMATCH'
  }

  $workstreams = Invoke-AuthenticatedGet "http://127.0.0.1:$apiPort/workstreams" $headers
  $summary.WORKSTREAMS_HTTP = [string]$workstreams.StatusCode
  if ($workstreams.StatusCode -ne 200) {
    $httpFailureEvidence = $workstreams.Content
    throw 'WORKSTREAMS_HTTP_NOT_200'
  }

  $policies = Invoke-AuthenticatedGet "http://127.0.0.1:$apiPort/marketing-os/external-action-policies" $headers
  $summary.POLICY_HTTP = [string]$policies.StatusCode
  if ($policies.StatusCode -ne 200) {
    $httpFailureEvidence = $policies.Content
    throw 'POLICY_HTTP_NOT_200'
  }

  $summary.RUNTIME_ACCEPTANCE = 'PASS'
} catch {
  $failure = if ($_.Exception -is [System.Management.Automation.RuntimeException]) { $_.Exception.Message } else { 'LOCAL_ACCEPTANCE_FAILED' }
} finally {
  if ($apiProcess -and -not $KeepApiRunning -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Restore-Environment $originalEnvironment
}

if ($failure) {
  if ($httpFailureEvidence) { Write-SanitizedText $httpFailureEvidence 'HTTP_EVIDENCE' }
  Write-SanitizedEvidence $probeStderr
  Write-SanitizedEvidence $serverStderr
  Write-SanitizedEvidence $serverStdout
}

$summary.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key)=$($_.Value)" }
if ($failure) {
  Write-Host "FAILURE=$failure"
  exit 1
}

if (-not $KeepApiRunning) {
  Remove-Item -LiteralPath $logDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
