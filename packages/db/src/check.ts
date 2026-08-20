import * as schema from './schema.js';

const requiredTables = [
  'tenants',
  'tenantMembers',
  'roles',
  'permissions',
  'engagements',
  'workflows',
  'workflowGraphSnapshots',
  'tasks',
  'taskAttempts',
  'taskDependencies',
  'executionLeases',
  'agentDefinitions',
  'agentVersions',
  'agentCapabilities',
  'workstreamDefinitions',
  'workstreamVersions',
  'dependencyEdges',
  'gateDefinitions',
  'artifacts',
  'artifactVersions',
  'artifactDependencies',
  'artifactValidations',
  'handoffs',
  'handoffDecisions',
  'approvalRequests',
  'approvalDecisions',
  'auditEvents',
  'executionRuns',
  'executionSteps',
  'providerCalls',
  'providerUsage',
  'retryAttempts',
  'workflowEvents',
  'executionErrors',
];
const missing = requiredTables.filter((table) => !(table in schema));
if (missing.length > 0)
  throw new Error(`Database schema foundation is incomplete: ${missing.join(', ')}`);
console.log(`Database schema foundation validated: ${requiredTables.length} tables`);
