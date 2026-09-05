import { loadConfig } from '@platform/config';
import { createDb } from '@platform/db';
import { WorkerTenantDatabase } from './tenant-database.js';

const config = loadConfig();
// Worker handlers must receive this scoped façade, never a process-global SET.
const tenantDatabase = new WorkerTenantDatabase(createDb(config.databaseUrl));
console.log(
  JSON.stringify({
    service: 'worker',
    status: 'configured',
    temporalAddress: config.temporalAddress,
    namespace: config.temporalNamespace,
    databaseTenantScope: tenantDatabase.constructor.name,
  }),
);
