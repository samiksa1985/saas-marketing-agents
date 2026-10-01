import { loadConfig } from '@platform/config';
import { createDb } from '@platform/db';
import { WorkerTenantDatabase } from './tenant-database.js';
import { createStructuredLogger } from '@platform/observability';

const config = loadConfig();
const logger = createStructuredLogger('worker');
// Worker handlers must receive this scoped façade, never a process-global SET.
const tenantDatabase = new WorkerTenantDatabase(createDb(config.databaseUrl));
logger.emit('info', 'worker.configured', {
  databaseTenantScope: tenantDatabase.constructor.name,
  workflowRuntimeMode: config.workflowRuntimeMode,
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.emit('info', 'worker.shutdown', { signal });
  process.exitCode = 0;
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
