param()
$ErrorActionPreference = 'Stop'
if ($env:NODE_ENV -ne 'production') { throw 'NODE_ENV must be production.' }
if ($env:NAWA_PRODUCTION_MIGRATION_CONFIRM -ne 'APPLY') { throw 'Set NAWA_PRODUCTION_MIGRATION_CONFIRM=APPLY after approved change control.' }
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'DATABASE_URL is required but is never printed.' }
npm --workspace packages/db run migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; do not attempt automated rollback.' }
npm --workspace packages/db run production:verify
if ($LASTEXITCODE -ne 0) { throw 'Post-migration verification failed; stop and follow recovery runbook.' }
