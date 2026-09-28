[CmdletBinding()]
param(
  [string]$CampaignId,
  [ValidateRange(1, 100)]
  [int]$CampaignLimit = 25,
  [string]$SecretDirectory = 'C:\Users\MBUZZ\.nawa-secrets',
  [string]$AccessTokenFile,
  [string]$AdAccountId,
  [string]$ApiVersion
)

$ErrorActionPreference = 'Stop'

# This is intentionally a standalone read-only onboarding proof. It does not
# start the API, write to PostgreSQL, create approvals, or invoke a governed
# mutation. Every request below is an explicitly constructed HTTP GET.
$summary = [ordered]@{
  META_CONFIG_VALIDATION = 'NOT_RUN'
  META_EXECUTION_SAFETY = 'NOT_RUN'
  META_ACCOUNT_ACCESS = 'NOT_RUN'
  META_AD_ACCOUNT_SCOPE = 'NOT_RUN'
  META_CAMPAIGN_LIST_READ = 'NOT_RUN'
  META_CAMPAIGN_READ = 'NOT_RUN'
  META_STATUS_READ = 'NOT_RUN'
  META_BUDGET_READ = 'NOT_RUN'
  META_PROVIDER_HEALTH = 'NOT_RUN'
  META_CREDENTIAL_HEALTH = 'NOT_RUN'
  META_READONLY_ACCEPTANCE = 'FAIL'
}

function ConvertTo-MetaAdAccountId([string]$Value, [string]$FailureCode) {
  $digits = $Value.Trim() -replace '^(?i:act_)', ''
  if ($digits -notmatch '^\d{1,20}$') { throw $FailureCode }
  return "act_$digits"
}

function ConvertTo-MetaCampaignId([string]$Value, [string]$FailureCode) {
  $normalized = $Value.Trim()
  if ($normalized -notmatch '^\d{1,20}$') { throw $FailureCode }
  return $normalized
}

function Get-RequiredEnvironmentValue([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) { throw "META_CONFIGURATION_MISSING_$Name" }
  return $value.Trim()
}

function Get-ConfiguredAdAccountAllowlist {
  $raw = Get-RequiredEnvironmentValue 'META_ADS_SANDBOX_AD_ACCOUNT_IDS'
  $values = @($raw.Split(',') | ForEach-Object {
    ConvertTo-MetaAdAccountId $_ 'META_ADS_SANDBOX_ALLOWLIST_INVALID'
  } | Select-Object -Unique)
  if ($values.Count -eq 0) { throw 'META_ADS_SANDBOX_ALLOWLIST_REQUIRED' }
  return $values
}

function Invoke-MetaGraphGet(
  [System.Net.Http.HttpClient]$Client,
  [string]$Version,
  [string]$Path,
  [string[]]$Fields,
  [string]$AccessToken,
  [int]$Limit = 0
) {
  $encodedFields = [Uri]::EscapeDataString(($Fields -join ','))
  $limitQuery = if ($Limit -gt 0) { "&limit=$Limit" } else { '' }
  $uri = "https://graph.facebook.com/$Version/$Path?fields=$encodedFields$limitQuery"
  $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $uri)
  try {
    # Keep the token out of the URI, evidence, and exception text.
    $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $AccessToken)
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    try {
      if (-not $response.IsSuccessStatusCode) {
        throw "META_GRAPH_READ_FAILED_HTTP_$([int]$response.StatusCode)"
      }
      $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      try { return $body | ConvertFrom-Json -Depth 20 } catch { throw 'META_GRAPH_READ_INVALID_JSON' }
    } finally {
      $response.Dispose()
    }
  } finally {
    $request.Dispose()
  }
}

function Get-PropertyText([object]$Value, [string]$Name) {
  $property = $Value.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) { return $null }
  return [string]$property.Value
}

$client = $null
$failure = $null
try {
  if ([string]::IsNullOrWhiteSpace($AccessTokenFile)) {
    $AccessTokenFile = Join-Path $SecretDirectory 'meta-ads-access-token.txt'
  }
  if (-not (Test-Path -LiteralPath $AccessTokenFile -PathType Leaf)) {
    throw 'META_ADS_ACCESS_TOKEN_FILE_MISSING'
  }

  # Read the secret once into process memory; it is never echoed or persisted.
  $accessToken = [IO.File]::ReadAllText($AccessTokenFile).Trim()
  if ([string]::IsNullOrWhiteSpace($accessToken)) { throw 'META_ADS_ACCESS_TOKEN_FILE_EMPTY' }

  if ([string]::IsNullOrWhiteSpace($AdAccountId)) {
    $AdAccountId = Get-RequiredEnvironmentValue 'META_ADS_AD_ACCOUNT_ID'
  }
  $adAccountId = ConvertTo-MetaAdAccountId $AdAccountId 'META_ADS_ACCOUNT_ID_INVALID'
  if ([string]::IsNullOrWhiteSpace($ApiVersion)) {
    $ApiVersion = [Environment]::GetEnvironmentVariable('META_ADS_API_VERSION', 'Process')
  }
  if ([string]::IsNullOrWhiteSpace($ApiVersion)) { $ApiVersion = 'v21.0' }
  if ($ApiVersion -notmatch '^v\d+\.\d+$') { throw 'META_ADS_API_VERSION_INVALID' }

  $mode = [Environment]::GetEnvironmentVariable('META_ADS_EXECUTION_MODE', 'Process')
  if ([string]::IsNullOrWhiteSpace($mode)) { $mode = 'DISABLED' }
  $enabled = [Environment]::GetEnvironmentVariable('META_ADS_EXECUTION_ENABLED', 'Process')
  if (-not [string]::IsNullOrWhiteSpace($enabled) -and $enabled -notin @('true', 'false')) {
    throw 'META_ADS_EXECUTION_ENABLED_INVALID'
  }
  if ($mode -ne 'DISABLED') { throw 'META_ADS_EXECUTION_MODE_NOT_DISABLED' }
  if ($enabled -eq 'true') { throw 'META_ADS_EXECUTION_ENABLED_MUST_BE_FALSE' }

  $allowlist = Get-ConfiguredAdAccountAllowlist
  if ($allowlist -notcontains $adAccountId) { throw 'META_ADS_TARGET_NOT_IN_SANDBOX_ALLOWLIST' }
  $summary.META_CONFIG_VALIDATION = 'PASS'
  $summary.META_EXECUTION_SAFETY = 'PASS'

  $client = [System.Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromSeconds(20)
  $account = Invoke-MetaGraphGet -Client $client -Version $ApiVersion -Path $adAccountId `
    -Fields @('id', 'account_id', 'name', 'currency') -AccessToken $accessToken
  $observedAccountId = ConvertTo-MetaAdAccountId (Get-PropertyText $account 'id') 'META_ADS_ACCOUNT_RESPONSE_INVALID'
  if ($observedAccountId -ne $adAccountId) { throw 'META_ADS_ACCOUNT_SCOPE_MISMATCH' }
  $summary.META_ACCOUNT_ACCESS = 'PASS'
  $summary.META_AD_ACCOUNT_SCOPE = 'PASS'

  $campaigns = Invoke-MetaGraphGet -Client $client -Version $ApiVersion -Path "$adAccountId/campaigns" `
    -Fields @('id', 'account_id', 'status', 'effective_status', 'daily_budget') -AccessToken $accessToken -Limit $CampaignLimit
  $campaignRows = @($campaigns.data)
  foreach ($campaign in $campaignRows) {
    $campaignAccountId = ConvertTo-MetaAdAccountId (Get-PropertyText $campaign 'account_id') 'META_ADS_CAMPAIGN_ACCOUNT_RESPONSE_INVALID'
    if ($campaignAccountId -ne $adAccountId) { throw 'META_ADS_CAMPAIGN_SCOPE_MISMATCH' }
  }
  $summary.META_CAMPAIGN_LIST_READ = 'PASS'

  if ([string]::IsNullOrWhiteSpace($CampaignId)) {
    if ($campaignRows.Count -eq 0) {
      $summary.META_CAMPAIGN_READ = 'NOT_APPLICABLE_NO_CAMPAIGNS'
      $summary.META_STATUS_READ = 'NOT_APPLICABLE_NO_CAMPAIGNS'
      $summary.META_BUDGET_READ = 'NOT_APPLICABLE_NO_CAMPAIGNS'
      throw 'META_READONLY_ACCEPTANCE_INCOMPLETE_NO_CAMPAIGNS'
    }
    throw 'META_CAMPAIGN_ID_REQUIRED_FOR_SELECTED_READ'
  }

  $campaignId = ConvertTo-MetaCampaignId $CampaignId 'META_ADS_CAMPAIGN_ID_INVALID'
  $campaign = Invoke-MetaGraphGet -Client $client -Version $ApiVersion -Path $campaignId `
    -Fields @('id', 'account_id', 'status', 'effective_status', 'daily_budget') -AccessToken $accessToken
  $observedCampaignId = ConvertTo-MetaCampaignId (Get-PropertyText $campaign 'id') 'META_ADS_CAMPAIGN_RESPONSE_INVALID'
  if ($observedCampaignId -ne $campaignId) { throw 'META_ADS_CAMPAIGN_ID_MISMATCH' }
  $campaignAccountId = ConvertTo-MetaAdAccountId (Get-PropertyText $campaign 'account_id') 'META_ADS_CAMPAIGN_ACCOUNT_RESPONSE_INVALID'
  if ($campaignAccountId -ne $adAccountId) { throw 'META_ADS_RESOURCE_NOT_ALLOWED' }
  $summary.META_CAMPAIGN_READ = 'PASS'

  $status = Get-PropertyText $campaign 'effective_status'
  if ([string]::IsNullOrWhiteSpace($status)) { $status = Get-PropertyText $campaign 'status' }
  if ([string]::IsNullOrWhiteSpace($status)) { throw 'META_ADS_CAMPAIGN_STATUS_MISSING' }
  $summary.META_STATUS_READ = 'PASS'

  $dailyBudget = Get-PropertyText $campaign 'daily_budget'
  if ([string]::IsNullOrWhiteSpace($dailyBudget)) {
    $summary.META_BUDGET_READ = 'NOT_APPLICABLE_NO_CAMPAIGN_DAILY_BUDGET'
    throw 'META_READONLY_ACCEPTANCE_INCOMPLETE_NO_CAMPAIGN_DAILY_BUDGET'
  }
  $parsedBudget = 0L
  if (-not [Int64]::TryParse($dailyBudget, [ref]$parsedBudget) -or $parsedBudget -lt 0) {
    throw 'META_ADS_CAMPAIGN_DAILY_BUDGET_INVALID'
  }
  $summary.META_BUDGET_READ = 'PASS'

  # The repository has no separate read-only health writer. A successful
  # account/campaign read is an ephemeral provider and token-health proof;
  # no provider-health database row is created by this script.
  $summary.META_PROVIDER_HEALTH = 'PASS'
  $summary.META_CREDENTIAL_HEALTH = 'PASS'
  $summary.META_READONLY_ACCEPTANCE = 'PASS'
} catch {
  $failure = if ($_.Exception.Message -match '^META_[A-Z0-9_]+$') { $_.Exception.Message } else { 'META_READONLY_ACCEPTANCE_FAILED' }
} finally {
  if ($null -ne $client) { $client.Dispose() }
}

$summary.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key)=$($_.Value)" }
Write-Host 'META_HTTP_METHODS=GET_ONLY'
if ($failure) {
  Write-Host "FAILURE=$failure"
  exit 1
}
