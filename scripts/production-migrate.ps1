param()
$ErrorActionPreference = 'Stop'
if ($env:NODE_ENV -ne 'production') { throw 'NODE_ENV must be production.' }
if ($env:NAWA_PRODUCTION_MIGRATION_CONFIRM -ne 'APPLY') { throw 'Set NAWA_PRODUCTION_MIGRATION_CONFIRM=APPLY after approved change control.' }
# Migration authority separation (WS-PROD-02): DATABASE_URL is the restricted
# runtime identity (codecore_app) used by post-migration verification;
# MIGRATION_DATABASE_URL is the privileged migration identity (codecore_owner)
# consumed only by packages/db/src/migrate.ts. Neither value is ever printed.
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'DATABASE_URL is required but is never printed.' }
if ([string]::IsNullOrWhiteSpace($env:MIGRATION_DATABASE_URL)) { Write-Warning 'MIGRATION_DATABASE_URL not set; migrations will run as the DATABASE_URL identity. Acceptable only for single-role trials, not for hardened production.' }
npm --workspace packages/db run migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; do not attempt automated rollback.' }
npm --workspace packages/db run production:verify
if ($LASTEXITCODE -ne 0) { throw 'Post-migration verification failed; stop and follow recovery runbook.' }
