Set-StrictMode -Version Latest

function Resolve-Phase1ScriptDirectory([string]$ScriptRoot, [string]$InvocationPath) {
  if (-not [string]::IsNullOrWhiteSpace($ScriptRoot) -and (Test-Path -LiteralPath $ScriptRoot -PathType Container)) {
    return (Resolve-Path -LiteralPath $ScriptRoot).Path
  }
  if (-not [string]::IsNullOrWhiteSpace($InvocationPath)) {
    $candidate = Split-Path -Parent $InvocationPath
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate -PathType Container)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  throw 'Cannot determine the Phase 1 script directory from PSScriptRoot or MyInvocation.MyCommand.Path.'
}

function Resolve-Phase1RepositoryRoot([string]$ScriptRoot, [string]$InvocationPath) {
  $scriptDirectory = Resolve-Phase1ScriptDirectory $ScriptRoot $InvocationPath
  $candidate = Split-Path -Parent $scriptDirectory
  if ([string]::IsNullOrWhiteSpace($candidate) -or -not (Test-Path -LiteralPath (Join-Path $candidate 'package.json') -PathType Leaf)) {
    throw 'Cannot determine a valid repository root from the Phase 1 script location.'
  }
  return (Resolve-Path -LiteralPath $candidate).Path
}
