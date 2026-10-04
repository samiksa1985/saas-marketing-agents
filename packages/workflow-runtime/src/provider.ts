import {
  InMemoryWorkflowRuntime,
  type WorkflowTaskCommandRuntime,
  type WorkflowRuntime,
} from './index.js';
import { InMemoryWorkflowQuery, type WorkflowRuntimeQuery } from './query.js';
import { PostgresWorkflowRuntime } from './postgres.js';
import { PostgresWorkflowQuery } from './postgres-query.js';

import type { PostgresWorkflowSqlClient } from './postgres.js';

/** Runtime selection is explicit; the in-memory implementation is dev/test only. */
export type WorkflowRuntimeMode = 'in-memory' | 'postgres';

export interface WorkflowRuntimeSelection {
  mode: WorkflowRuntimeMode;
  runtime: WorkflowRuntime;
  query: WorkflowRuntimeQuery;
  /** Present only when the selected provider supports API task commands. */
  taskCommands?: WorkflowTaskCommandRuntime;
  durable: boolean;
}

export interface WorkflowRuntimeProviderOptions {
  mode: WorkflowRuntimeMode;
  repositoryRoot?: string;
  postgresClient?: PostgresWorkflowSqlClient;
}

/**
 * Builds the canonical workflow runtime abstraction. Production selects the
 * PostgreSQL durable runtime; in-memory remains explicitly dev/test only.
 */
export function createWorkflowRuntime(
  options: WorkflowRuntimeProviderOptions,
): WorkflowRuntimeSelection {
  if (options.mode === 'in-memory') {
    const runtime = new InMemoryWorkflowRuntime(options.repositoryRoot);
    return {
      mode: 'in-memory',
      runtime,
      query: new InMemoryWorkflowQuery(runtime),
      taskCommands: runtime,
      durable: false,
    };
  }

  if (!options.postgresClient) {
    throw new Error('A PostgreSQL workflow client is required when WORKFLOW_RUNTIME_MODE=postgres');
  }

  const runtime = new PostgresWorkflowRuntime(options.postgresClient);
  return {
    mode: 'postgres',
    runtime,
    query: new PostgresWorkflowQuery(runtime),
    taskCommands: runtime,
    durable: true,
  };
}
