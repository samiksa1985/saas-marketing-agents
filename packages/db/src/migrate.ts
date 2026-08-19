import { loadConfig } from '@platform/config';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';

const config = loadConfig();
const client = postgres(config.databaseUrl);
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();
