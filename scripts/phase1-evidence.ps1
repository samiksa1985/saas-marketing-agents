Set-StrictMode -Version Latest

function Get-Phase1HarnessResultFromLog([string]$Path) {
  $matches = Select-String -LiteralPath $Path -Pattern '^PHASE1_POSTGRES_RESULT=(.+)$' | Select-Object -Last 1
  if (-not $matches) { throw 'No PHASE1_POSTGRES_RESULT line was emitted; evidence is incomplete.' }
  return $matches.Matches[0].Groups[1].Value | ConvertFrom-Json
}

function Save-Phase1EvidenceResult([object]$Result, [string]$Path) {
  if ($null -eq $Result.PSObject.Properties['timestamp']) {
    $Result | Add-Member -NotePropertyName timestamp -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
  }
  $json = $Result | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

function Get-Phase1PersistedResult([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Persisted Phase 1 result does not exist: $Path"
  }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}
