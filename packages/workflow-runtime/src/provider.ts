import {
  InMemoryWorkflowRuntime,
  type WorkflowTaskCommandRuntime,
  type WorkflowRuntime,
} from './index.js';
import {
  TemporalWorkflowRuntime,
  type TemporalWorkflowAdapter,
} from './temporal.js';
import {
  InMemoryWorkflowQuery,
  TemporalWorkflowQuery,
  type TemporalWorkflowReadModel,
  type WorkflowRuntimeQuery,
} from './query.js';

/** Runtime selection is explicit; the in-memory implementation is dev/test only. */
export type WorkflowRuntimeMode = 'in-memory' | 'temporal';

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
  temporalAdapter?: TemporalWorkflowAdapter;
  temporalReadModel?: TemporalWorkflowReadModel;
}

/**
 * Builds the single canonical workflow runtime abstraction.
 *
 * Production composition supplies a Temporal adapter; this package deliberately
 * does not create a second workflow engine or connect to Temporal itself.
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

  if (!options.temporalAdapter) {
    throw new Error('A Temporal workflow adapter is required when WORKFLOW_RUNTIME_MODE=temporal');
  }

  if (!options.temporalReadModel) {
    throw new Error('A Temporal workflow read model is required when WORKFLOW_RUNTIME_MODE=temporal');
  }

  return {
    mode: 'temporal',
    runtime: new TemporalWorkflowRuntime(options.temporalAdapter),
    query: new TemporalWorkflowQuery(options.temporalReadModel),
    durable: true,
  };
}
