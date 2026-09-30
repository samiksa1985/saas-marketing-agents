$script:postgresCliScript = Join-Path $PSScriptRoot 'postgres-cli.mjs'

function Get-PostgresNodeExecutable {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
  if (-not $node) { throw 'NODE_EXECUTABLE_REQUIRED' }
  return $node.Source
}

function Get-PostgresConnectionMetadata {
  param([Parameter(Mandatory=$true)][string]$ConnectionEnvironment)

  $node = Get-PostgresNodeExecutable
  $output = & $node $script:postgresCliScript inspect --connection-env $ConnectionEnvironment
  if ($LASTEXITCODE -ne 0) { throw 'POSTGRES_CONNECTION_IDENTITY_FAILED' }
  try {
    return ($output -join "`n") | ConvertFrom-Json
  } catch {
    throw 'POSTGRES_CONNECTION_IDENTITY_INVALID'
  }
}

function Invoke-PostgresTool {
  param(
    [Parameter(Mandatory=$true)][string]$Tool,
    [Parameter(Mandatory=$true)][string]$ConnectionEnvironment,
    [Parameter(Mandatory=$true)][string[]]$ToolArguments,
    [string]$Database,
    [switch]$CaptureOutput
  )

  $node = Get-PostgresNodeExecutable
  $arguments = @(
    $script:postgresCliScript,
    'run',
    '--connection-env',
    $ConnectionEnvironment,
    '--tool',
    $Tool
  )
  if (-not [string]::IsNullOrWhiteSpace($Database)) {
    $arguments += @('--database', $Database)
  }
  if ($CaptureOutput) { $arguments += '--capture-output' }
  $arguments += '--'
  $arguments += $ToolArguments
  $output = & $node @arguments
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = ($output -join "`n")
  }
}

Export-ModuleMember -Function Get-PostgresConnectionMetadata, Invoke-PostgresTool
