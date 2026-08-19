import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export function createDb(connectionString: string) {
  return drizzle(postgres(connectionString), { schema });
}
export { schema };
