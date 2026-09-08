import { sql } from 'drizzle-orm';
import {
  billingUsageCounters,
  billingUsageEvents,
} from '@platform/db';

export interface AtomicUsageDatabase {
  execute: (query: unknown) => Promise<unknown>;
}

export interface ConsumeUsageRequest {
  tenantId: string;
  key: string;
  amount: number;
  limit: number;
  periodStart: string;
  periodEnd: string;
  idempotencyKey: string;
  source: string;
  agentRunId?: string;
  workflowRunId?: string;
}

export interface ConsumeUsageResult {
  consumed: boolean;
  duplicate: boolean;
  used: number;
  limit: number;
  remaining: number;
}

function validate(request: ConsumeUsageRequest): void {
  if (!request.tenantId) {
    throw new Error('Tenant context is required');
  }

  if (!request.key) {
    throw new Error('Usage key is required');
  }

  if (!Number.isInteger(request.amount) || request.amount <= 0) {
    throw new Error('Usage amount must be a positive integer');
  }

  if (!Number.isInteger(request.limit) || request.limit < 0) {
    throw new Error('Usage limit must be a non-negative integer');
  }

  if (!request.idempotencyKey) {
    throw new Error('Usage idempotency key is required');
  }
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }

  if (
    result &&
    typeof result === 'object' &&
    'rows' in result &&
    Array.isArray((result as { rows?: unknown[] }).rows)
  ) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }

  return [];
}

/**
 * Consumes a usage unit through one PostgreSQL statement.
 *
 * The idempotency event is reserved before the counter mutation. PostgreSQL's
 * unique-index conflict handling serializes concurrent requests with the same
 * tenant/key pair, so only the request that inserted the reservation can
 * increment the counter. A quota-rejected reservation is removed in the same
 * statement and therefore cannot turn a later retry into a false duplicate.
 */
export class AtomicBillingUsageStore {
  constructor(private readonly db: AtomicUsageDatabase) {}

  async consume(request: ConsumeUsageRequest): Promise<ConsumeUsageResult> {
    validate(request);

    /**
     * This statement intentionally uses raw SQL for its single-statement
     * reservation/upsert semantics. Bind timestamp values through their
     * canonical Drizzle column encoders, rather than interpolating Date
     * objects directly. The postgres.js adapter receives ISO strings while
     * the schema remains the authoritative `timestamp with time zone` /
     * Drizzle `date` contract.
     */
    const eventPeriodStart = sql.param(
      new Date(request.periodStart),
      billingUsageEvents.periodStart,
    );
    const eventPeriodEnd = sql.param(
      new Date(request.periodEnd),
      billingUsageEvents.periodEnd,
    );
    const counterPeriodStart = sql.param(
      new Date(request.periodStart),
      billingUsageCounters.periodStart,
    );
    const counterPeriodEnd = sql.param(
      new Date(request.periodEnd),
      billingUsageCounters.periodEnd,
    );

    const result = await this.db.execute(sql`
      WITH reserved_event AS (
        INSERT INTO "billing_usage_events" (
          "tenant_id",
          "key",
          "amount",
          "idempotency_key",
          "source",
          "agent_run_id",
          "workflow_run_id",
          "period_start",
          "period_end"
        )
        VALUES (
          ${request.tenantId}::uuid,
          ${request.key},
          ${request.amount},
          ${request.idempotencyKey},
          ${request.source},
          ${request.agentRunId ?? null},
          ${request.workflowRunId ?? null},
          ${eventPeriodStart},
          ${eventPeriodEnd}
        )
        ON CONFLICT ("tenant_id", "idempotency_key")
        DO NOTHING
        RETURNING "id"
      ),

      counter_upsert AS (
        INSERT INTO "billing_usage_counters" (
          "tenant_id",
          "key",
          "period_start",
          "period_end",
          "used",
          "limit"
        )
        SELECT
          ${request.tenantId}::uuid,
          ${request.key},
          ${counterPeriodStart},
          ${counterPeriodEnd},
          ${request.amount},
          ${request.limit}
        FROM reserved_event
        ON CONFLICT (
          "tenant_id",
          "key",
          "period_start",
          "period_end"
        )
        DO UPDATE
        SET
          "used" =
            "billing_usage_counters"."used" +
            EXCLUDED."used",
          "limit" =
            EXCLUDED."limit",
          "updated_at" =
            now()
        WHERE
          "billing_usage_counters"."used" +
          EXCLUDED."used" <=
          EXCLUDED."limit"
        RETURNING
          "used",
          "limit"
      ),

      discard_quota_rejected_event AS (
        DELETE FROM "billing_usage_events" AS event
        USING reserved_event
        WHERE
          event."id" =
            reserved_event."id"
          AND NOT EXISTS (
            SELECT 1
            FROM counter_upsert
          )
        RETURNING event."id"
      )

      SELECT
        CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM reserved_event
          )
          THEN true
          ELSE false
        END AS "duplicate",

        CASE
          WHEN EXISTS (
            SELECT 1
            FROM counter_upsert
          )
          THEN true
          ELSE false
        END AS "consumed",

        COALESCE(
          (
            SELECT "used"
            FROM counter_upsert
            LIMIT 1
          ),
          (
            SELECT "used"
            FROM "billing_usage_counters"
            WHERE
              "tenant_id" =
                ${request.tenantId}::uuid
              AND "key" =
                ${request.key}
              AND "period_start" =
                ${counterPeriodStart}
              AND "period_end" =
                ${counterPeriodEnd}
            LIMIT 1
          ),
          0
        ) AS "used";
    `);

    const row = rowsOf(result)[0] ?? {};
    const duplicate = row.duplicate === true;
    const consumed = row.consumed === true;
    const used = Number(row.used ?? 0);

    if (!duplicate && !consumed) {
      throw new Error(`Usage quota exhausted: ${request.key}`);
    }

    return {
      consumed,
      duplicate,
      used,
      limit: request.limit,
      remaining: Math.max(0, request.limit - used),
    };
  }
}
