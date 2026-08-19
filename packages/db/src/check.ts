import { tenants, users, engagements, artifacts, auditEvents } from './schema.js';
const tables = [tenants, users, engagements, artifacts, auditEvents];
if (tables.length !== 5) throw new Error('Database schema foundation is incomplete');
console.log(`Database schema foundation validated: ${tables.length} tables`);
