/**
 * WAVE-AB P1: dedicated grant convergence for the production runtime role.
 * Compiled into the migration artifact so deployment entrypoints execute
 * MIGRATE -> CONVERGE GRANTS -> PRODUCTION VERIFY without tsx or rotation.
 */
process.env.CODECORE_GRANTS_CONVERGE_ONLY = 'true';
await import('./provision-production-roles-impl.js').then((m) => m.provisionProductionRoles());
