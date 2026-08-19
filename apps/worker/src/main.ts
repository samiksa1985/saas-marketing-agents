import { loadConfig } from '@platform/config';

const config = loadConfig();
console.log(
  JSON.stringify({
    service: 'worker',
    status: 'configured',
    temporalAddress: config.temporalAddress,
    namespace: config.temporalNamespace,
  }),
);
