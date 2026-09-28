import { boundedSqlContext } from './phase1-migration-diagnostics.js';

type PostgresFailure = {
  code?: unknown;
  message?: unknown;
  position?: unknown;
  routine?: unknown;
  name?: unknown;
  stack?: unknown;
};

export type Phase1ValidationDiagnosticValue = string | number | boolean | null;
export type Phase1ValidationDiagnostics = Record<string, Phase1ValidationDiagnosticValue>;

const unavailableSqlContext = '<SQL source unavailable for validation check>';

export interface Phase1ValidationFailureEvidence {
  status: 'FAIL';
  phase: 'validation';
  check: string;
  postgresCode: string | null;
  message: string;
  position: string | null;
  routine: string | null;
  sqlContext: string;
  step?: string;
  observedState?: string;
  diagnostics?: Phase1ValidationDiagnostics;
  errorName?: string;
  stack?: string;
}

export interface Phase1ValidationOptions {
  stepMarker?: string;
  observationMarker?: string;
}

export class Phase1ValidationExecutionError extends Error {
  constructor(readonly evidence: Phase1ValidationFailureEvidence) {
    super(evidence.message);
    this.name = 'Phase1ValidationExecutionError';
  }
}

/**
 * Mark a distinct Phase 1 validation check and retain PostgreSQL diagnostics
 * without allowing a failed sub-phase to be reported as a generic harness error.
 */
export async function executePhase1ValidationCheck<T>(
  check: string,
  operation: (
    recordSql: (source: string) => void,
    recordStep: (step: string) => void,
    recordObservation: (observation: string) => void,
    recordDiagnostics: (diagnostics: Phase1ValidationDiagnostics) => void,
  ) => Promise<T>,
  log: (message: string) => void = console.log,
  options: Phase1ValidationOptions = {},
): Promise<T> {
  let source: string | undefined;
  let step: string | undefined;
  let observedState: string | undefined;
  let diagnostics: Phase1ValidationDiagnostics | undefined;
  log(`PHASE1_CHECK_START=${check}`);
  try {
    const result = await operation(
      (statement) => {
        source = statement;
      },
      (nextStep) => {
        step = nextStep;
        if (options.stepMarker) log(`${options.stepMarker}=${nextStep}`);
      },
      (nextObservedState) => {
        observedState = nextObservedState;
        if (options.observationMarker) log(`${options.observationMarker}=${nextObservedState}`);
      },
      (nextDiagnostics) => {
        diagnostics = { ...diagnostics, ...nextDiagnostics };
      },
    );
    log(`PHASE1_CHECK_PASS=${check}`);
    return result;
  } catch (error) {
    const postgres = error as PostgresFailure;
    throw new Phase1ValidationExecutionError({
      status: 'FAIL',
      phase: 'validation',
      check,
      postgresCode: postgres.code === undefined ? null : String(postgres.code),
      message: String(postgres.message ?? error ?? 'Unknown PostgreSQL validation failure').slice(0, 600),
      position: postgres.position === undefined ? null : String(postgres.position),
      routine: postgres.routine === undefined ? null : String(postgres.routine),
      sqlContext: source ? boundedSqlContext(source, postgres.position) : unavailableSqlContext,
      ...(step ? { step } : {}),
      ...(observedState ? { observedState } : {}),
      ...(diagnostics ? { diagnostics } : {}),
      ...(typeof postgres.name === 'string' ? { errorName: postgres.name } : {}),
      ...(typeof postgres.stack === 'string' ? { stack: postgres.stack.slice(0, 1600) } : {}),
    });
  }
}
