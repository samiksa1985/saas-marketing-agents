/**
 * WAVE-AB P1: dedicated grant convergence for the production runtime role.
 * Runs the same bounded provisioning script with CODECORE_GRANTS_CONVERGE_ONLY
 * so credentials are never rotated during upgrade-time convergence.
 *
 * Production order: MIGRATE → CONVERGE GRANTS → PRODUCTION VERIFY.
 */
process.env.CODECORE_GRANTS_CONVERGE_ONLY = 'true';
await import('./provision-production-roles.js');
