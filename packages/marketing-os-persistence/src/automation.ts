import {
  sql,
} from 'drizzle-orm';

import type {
  AutomationDefinition,
  AutomationExecutionRequest,
  AutomationTrigger,
} from '@platform/contracts';

interface ExecuteResult {
  rows?: unknown[];
  [key: string]: unknown;
}

export interface AutomationPersistenceDatabase {
  execute(
    query: unknown,
  ): Promise<
    ExecuteResult | unknown[]
  >;
}

function rowsOf(
  result:
    ExecuteResult | unknown[],
): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as
      Record<string, unknown>[];
  }

  if (
    result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as
      Record<string, unknown>[];
  }

  return [];
}

function requireTenant(
  tenantId: string,
): void {
  if (!tenantId) {
    throw new Error(
      'Tenant context is required',
    );
  }
}

function assertTenant(
  expected: string,
  actual: string,
): void {
  requireTenant(actual);

  if (expected !== actual) {
    throw new Error(
      'Cross-tenant automation access denied',
    );
  }
}

function triggerConfig(
  trigger:
    AutomationTrigger,
): Record<string, unknown> {
  switch (trigger.type) {
    case 'MANUAL':
      return {};

    case 'EVENT':
      return {
        eventType:
          trigger.eventType,
      };

    case 'SCHEDULE':
      return {
        scheduleExpression:
          trigger.scheduleExpression,
        ...(trigger.timezone
          ? {
              timezone:
                trigger.timezone,
            }
          : {}),
      };

    case 'WEBHOOK':
      return {
        webhookKey:
          trigger.webhookKey,
      };
  }
}

export class AutomationStore {
  constructor(
    private readonly db:
      AutomationPersistenceDatabase,
  ) {}

  async saveDefinition(
    definition:
      AutomationDefinition,
    tenantId:
      string,
  ): Promise<void> {
    assertTenant(
      definition.tenantId,
      tenantId,
    );

    await this.db.execute(
      sql`
        INSERT INTO automation_definitions (
          id,
          tenant_id,
          name,
          enabled,
          trigger_type,
          trigger_config,
          condition_mode,
          conditions,
          workflow_reference,
          locale,
          created_at,
          updated_at
        )
        VALUES (
          ${definition.id}::uuid,
          ${definition.tenantId}::uuid,
          ${definition.name},
          ${definition.enabled},
          ${definition.trigger.type},
          ${JSON.stringify(
            triggerConfig(
              definition.trigger,
            ),
          )}::jsonb,
          ${definition.conditionMode},
          ${JSON.stringify(
            definition.conditions,
          )}::jsonb,
          ${definition.workflowReference},
          ${definition.locale},
          ${definition.createdAt}::timestamptz,
          ${definition.updatedAt}::timestamptz
        )
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          enabled = EXCLUDED.enabled,
          trigger_type = EXCLUDED.trigger_type,
          trigger_config = EXCLUDED.trigger_config,
          condition_mode = EXCLUDED.condition_mode,
          conditions = EXCLUDED.conditions,
          workflow_reference = EXCLUDED.workflow_reference,
          locale = EXCLUDED.locale,
          updated_at = EXCLUDED.updated_at
        WHERE
          automation_definitions.tenant_id =
          EXCLUDED.tenant_id
      `,
    );
  }

  async getDefinition(
    tenantId: string,
    automationId: string,
  ): Promise<
    Record<string, unknown> | null
  > {
    requireTenant(
      tenantId,
    );

    const result =
      await this.db.execute(
        sql`
          SELECT *
          FROM automation_definitions
          WHERE
            tenant_id =
              ${tenantId}::uuid
            AND id =
              ${automationId}::uuid
          LIMIT 1
        `,
      );

    return (
      rowsOf(result)[0] ??
      null
    );
  }
}


export interface AutomationExecutionClaim {
  claimed: boolean;
  duplicate?: boolean;
  executionId?: string;
  workflowId?: string;
}

export class AutomationExecutionStore {
  constructor(
    private readonly db:
      AutomationPersistenceDatabase,

    private readonly leaseSeconds =
      120,
  ) {}

  async claim(
    request:
      AutomationExecutionRequest,
  ): Promise<
    | {
        claimed: true;
        executionId: string;
      }
    | {
        claimed: false;
        duplicate: true;
        workflowId?: string;
      }
  > {
    requireTenant(
      request.tenantId,
    );

    /*
     * Rules:
     * - first request inserts PENDING
     * - FAILED execution may be retried
     * - stale PENDING lease may be reclaimed
     * - STARTED execution is duplicate
     * - active PENDING execution is duplicate
     *
     * ON CONFLICT row locking prevents concurrent
     * requests with the same idempotency key from
     * both acquiring the execution.
     */
    const result =
      await this.db.execute(
        sql`
          INSERT INTO automation_executions (
            tenant_id,
            automation_id,
            idempotency_key,
            trigger_type,
            status,
            payload,
            attempts,
            occurred_at,
            last_attempt_at,
            lease_expires_at
          )
          VALUES (
            ${request.tenantId}::uuid,
            ${request.automationId}::uuid,
            ${request.idempotencyKey},
            ${request.triggerType},
            'PENDING',
            ${JSON.stringify(
              request.payload,
            )}::jsonb,
            1,
            ${request.occurredAt}::timestamptz,
            now(),
            now() +
              (${this.leaseSeconds} * interval '1 second')
          )
          ON CONFLICT (
            tenant_id,
            automation_id,
            idempotency_key
          )
          DO UPDATE SET
            status = 'PENDING',
            attempts =
              automation_executions.attempts + 1,
            last_attempt_at = now(),
            lease_expires_at =
              now() +
              (${this.leaseSeconds} * interval '1 second'),
            error = NULL,
            updated_at = now()
          WHERE
            automation_executions.status = 'FAILED'
            OR (
              automation_executions.status = 'PENDING'
              AND
              automation_executions.lease_expires_at < now()
            )
          RETURNING
            id,
            workflow_id
        `,
      );

    const rows =
      rowsOf(
        result,
      );

    if (
      rows.length > 0
    ) {
      return {
        claimed: true,
        executionId:
          String(
            rows[0]!.id,
          ),
      };
    }

    const existing =
      await this.db.execute(
        sql`
          SELECT
            id,
            status,
            workflow_id
          FROM automation_executions
          WHERE
            tenant_id =
              ${request.tenantId}::uuid
            AND automation_id =
              ${request.automationId}::uuid
            AND idempotency_key =
              ${request.idempotencyKey}
          LIMIT 1
        `,
      );

    const row =
      rowsOf(
        existing,
      )[0];

    if (!row) {
      throw new Error(
        'Automation execution claim could not be resolved',
      );
    }

    return {
      claimed: false,
      duplicate: true,
      ...(row.workflow_id
        ? {
            workflowId:
              String(
                row.workflow_id,
              ),
          }
        : {}),
    };
  }

  async markStarted(
    executionId:
      string,
    workflowId:
      string,
  ): Promise<void> {
    await this.db.execute(
      sql`
        UPDATE automation_executions
        SET
          status = 'STARTED',
          workflow_id =
            ${workflowId},
          lease_expires_at = NULL,
          error = NULL,
          updated_at = now()
        WHERE
          id =
            ${executionId}::uuid
          AND status = 'PENDING'
      `,
    );
  }

  async markFailed(
    executionId:
      string,
    error:
      string,
  ): Promise<void> {
    await this.db.execute(
      sql`
        UPDATE automation_executions
        SET
          status = 'FAILED',
          lease_expires_at = NULL,
          error =
            ${error},
          updated_at = now()
        WHERE
          id =
            ${executionId}::uuid
          AND status = 'PENDING'
      `,
    );
  }
}
