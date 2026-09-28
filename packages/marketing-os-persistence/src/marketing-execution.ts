import {
  sql,
} from 'drizzle-orm';

import type {
  MarketingExecutionApprovalBinding,
  MarketingExecutionArtifact,
  MarketingExecutionWorkflowBinding,
} from '@platform/contracts';


interface ExecuteResult {
  rows?: unknown[];
  [key: string]: unknown;
}

export interface MarketingExecutionPersistenceDatabase {
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
  if (
    Array.isArray(result)
  ) {
    return result as
      Record<string, unknown>[];
  }

  if (
    result &&
    Array.isArray(
      result.rows,
    )
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
  requireTenant(
    actual,
  );

  if (
    expected !== actual
  ) {
    throw new Error(
      'Cross-tenant marketing execution access denied',
    );
  }
}


export class MarketingExecutionStore {
  constructor(
    private readonly db:
      MarketingExecutionPersistenceDatabase,
  ) {}


  async saveArtifact(
    artifact:
      MarketingExecutionArtifact,

    tenantId:
      string,
  ): Promise<void> {
    assertTenant(
      artifact.tenantId,
      tenantId,
    );

    await this.db.execute(
      sql`
        INSERT INTO marketing_execution_artifacts (
          id,
          tenant_id,
          domain,
          capability_id,
          workflow_id,
          task_id,
          workstream_id,
          status,
          version,
          output,
          evidence_ids,
          approval_id,
          approved_conditions,
          created_at,
          updated_at
        )
        VALUES (
          ${artifact.id}::uuid,
          ${artifact.tenantId}::uuid,
          ${artifact.domain},
          ${artifact.capabilityId},
          ${artifact.workflowId},
          ${artifact.taskId},
          ${artifact.workstreamId},
          ${artifact.status},
          ${artifact.version},
          ${JSON.stringify(
            artifact.output,
          )}::jsonb,
          ${JSON.stringify(
            artifact.evidenceIds,
          )}::jsonb,
          ${artifact.approvalId ?? null},
          ${
            artifact.approvedConditions
              ? JSON.stringify(
                  artifact.approvedConditions,
                )
              : null
          }::jsonb,
          ${artifact.createdAt}::timestamptz,
          ${artifact.updatedAt}::timestamptz
        )
        ON CONFLICT (id)
        DO UPDATE SET
          status =
            EXCLUDED.status,
          version =
            EXCLUDED.version,
          output =
            EXCLUDED.output,
          evidence_ids =
            EXCLUDED.evidence_ids,
          approval_id =
            EXCLUDED.approval_id,
          approved_conditions =
            EXCLUDED.approved_conditions,
          updated_at =
            EXCLUDED.updated_at
        WHERE
          marketing_execution_artifacts.tenant_id =
          EXCLUDED.tenant_id
      `,
    );
  }


  async saveApprovalBinding(
    binding:
      MarketingExecutionApprovalBinding,

    tenantId:
      string,
  ): Promise<void> {
    assertTenant(
      binding.tenantId,
      tenantId,
    );

    await this.db.execute(
      sql`
        INSERT INTO marketing_execution_approval_bindings (
          tenant_id,
          artifact_id,
          approval_id,
          status,
          conditions
        )
        VALUES (
          ${binding.tenantId}::uuid,
          ${binding.artifactId}::uuid,
          ${binding.approvalId},
          ${binding.status},
          ${
            binding.conditions
              ? JSON.stringify(
                  binding.conditions,
                )
              : null
          }::jsonb
        )
        ON CONFLICT (
          tenant_id,
          artifact_id
        )
        DO UPDATE SET
          approval_id =
            EXCLUDED.approval_id,
          status =
            EXCLUDED.status,
          conditions =
            EXCLUDED.conditions,
          updated_at =
            now()
      `,
    );
  }


  async saveWorkflowBinding(
    binding:
      MarketingExecutionWorkflowBinding,

    tenantId:
      string,
  ): Promise<void> {
    assertTenant(
      binding.tenantId,
      tenantId,
    );

    await this.db.execute(
      sql`
        INSERT INTO marketing_execution_workflow_bindings (
          tenant_id,
          artifact_id,
          workflow_id,
          task_id,
          workstream_id,
          from_domain,
          to_domain
        )
        VALUES (
          ${binding.tenantId}::uuid,
          ${binding.artifactId}::uuid,
          ${binding.workflowId},
          ${binding.taskId},
          ${binding.workstreamId},
          ${binding.fromDomain},
          ${binding.toDomain ?? null}
        )
        ON CONFLICT (
          tenant_id,
          artifact_id
        )
        DO UPDATE SET
          workflow_id =
            EXCLUDED.workflow_id,
          task_id =
            EXCLUDED.task_id,
          workstream_id =
            EXCLUDED.workstream_id,
          from_domain =
            EXCLUDED.from_domain,
          to_domain =
            EXCLUDED.to_domain,
          updated_at =
            now()
      `,
    );
  }


  async getArtifact(
    tenantId:
      string,

    artifactId:
      string,
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
          FROM marketing_execution_artifacts
          WHERE
            tenant_id =
              ${tenantId}::uuid
            AND id =
              ${artifactId}::uuid
          LIMIT 1
        `,
      );

    return (
      rowsOf(
        result,
      )[0] ??
      null
    );
  }
}
