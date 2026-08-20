import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  Param,
  Post,
} from '@nestjs/common';
import { hasPermission } from '@platform/domain';
import type { Locale, Permission, TenantContext } from '@platform/contracts';
import { InMemoryWorkflowRuntime, type TransitionMetadata } from '@platform/workflow-runtime';

interface WorkflowBody {
  engagementId: string;
  locale?: Locale;
  selectedWorkstreamIds: string[];
  idempotencyKey?: string;
  reason?: string;
}
interface CommandBody {
  reason?: string;
  idempotencyKey?: string;
  workerId?: string;
  defects?: Array<{ code: string; message: string; field?: string }>;
}

@Injectable()
export class WorkflowApiService {
  readonly runtime = new InMemoryWorkflowRuntime();

  context(tenantId: string | undefined, userId?: string, locale?: Locale): TenantContext {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required');
    return {
      tenantId,
      ...(userId ? { userId } : {}),
      roles: ['tenant_admin'],
      permissions: [
        'workflow:read',
        'workflow:execute',
        'artifact:read',
        'artifact:write',
        'approval:decide',
      ],
      locale: locale ?? 'en',
    };
  }
  authorize(context: TenantContext, permission: Permission): void {
    if (!hasPermission(context, permission))
      throw new ForbiddenException(`Missing permission: ${permission}`);
  }
  metadata(
    body: CommandBody | undefined,
    headers: { userId: string | undefined; idempotencyKey: string | undefined },
  ): TransitionMetadata {
    return {
      actor: headers.userId ?? 'api-user',
      reason: body?.reason ?? 'API command',
      timestamp: new Date().toISOString(),
      idempotencyKey: body?.idempotencyKey ?? headers.idempotencyKey ?? `api-${Date.now()}`,
    };
  }
}

@Controller()
export class WorkflowController {
  constructor(private readonly service: WorkflowApiService) {}

  @Post('/workflows') async create(
    @Body() body: WorkflowBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('accept-language') language?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const context = this.service.context(
      tenantId,
      userId,
      language?.includes('ar') ? 'ar-SA' : 'en-US',
    );
    this.service.authorize(context, 'workflow:execute');
    if (!body?.engagementId || !Array.isArray(body.selectedWorkstreamIds))
      throw new BadRequestException('engagementId and selectedWorkstreamIds are required');
    return this.service.runtime.createWorkflow({
      tenantId: context.tenantId,
      engagementId: body.engagementId,
      locale: body.locale ?? context.locale,
      selectedWorkstreamIds: body.selectedWorkstreamIds,
      idempotencyKey: body.idempotencyKey ?? idempotencyKey ?? `create-${Date.now()}`,
    });
  }

  @Get('/workflows/:workflowId') get(
    @Param('workflowId') workflowId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:read');
    return this.service.runtime.getWorkflow(workflowId, context);
  }
  @Post('/workflows/:workflowId/start') start(
    @Param('workflowId') workflowId: string,
    @Body() body: CommandBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.command(workflowId, body, tenantId, userId, idempotencyKey, 'start');
  }
  @Post('/workflows/:workflowId/pause') pause(
    @Param('workflowId') workflowId: string,
    @Body() body: CommandBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.command(workflowId, body, tenantId, userId, idempotencyKey, 'pause');
  }
  @Post('/workflows/:workflowId/resume') resume(
    @Param('workflowId') workflowId: string,
    @Body() body: CommandBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.command(workflowId, body, tenantId, userId, idempotencyKey, 'resume');
  }
  @Post('/workflows/:workflowId/cancel') cancel(
    @Param('workflowId') workflowId: string,
    @Body() body: CommandBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.command(workflowId, body, tenantId, userId, idempotencyKey, 'cancel');
  }
  @Get('/workflows/:workflowId/readiness') readiness(
    @Param('workflowId') workflowId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:read');
    return this.service.runtime.getTasks(workflowId, context).map((task) => ({
      taskId: task.id,
      workstreamId: task.workstreamId,
      readiness: this.service.runtime.isTaskReady(task.id, context),
    }));
  }
  @Get('/workflows/:workflowId/tasks') tasks(
    @Param('workflowId') workflowId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:read');
    return this.service.runtime.getTasks(workflowId, context);
  }
  @Get('/workflows/:workflowId/artifacts') artifacts(
    @Param('workflowId') workflowId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'artifact:read');
    return this.service.runtime.getArtifacts(workflowId, context);
  }
  @Get('/workflows/:workflowId/handoffs') handoffs(
    @Param('workflowId') workflowId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:read');
    return this.service.runtime.getHandoffs(workflowId, context);
  }

  @Post('/tasks/:taskId/claim') claim(
    @Param('taskId') taskId: string,
    @Body() body: CommandBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:execute');
    const metadata = this.service.metadata(body, { userId, idempotencyKey });
    if (!body?.workerId) throw new BadRequestException('workerId is required');
    return this.service.runtime.claimTask(
      taskId,
      body.workerId,
      metadata.idempotencyKey,
      context,
      metadata,
    );
  }
  @Post('/tasks/:taskId/retry') retry(
    @Param('taskId') taskId: string,
    @Body() body: CommandBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:execute');
    return this.service.runtime.retryTask(
      taskId,
      context,
      this.service.metadata(body, { userId, idempotencyKey }),
    );
  }
  @Post('/tasks/:taskId/repair') repair(
    @Param('taskId') taskId: string,
    @Body() body: CommandBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:execute');
    return this.service.runtime.repairTask(
      taskId,
      context,
      this.service.metadata(body, { userId, idempotencyKey }),
    );
  }
  @Post('/tasks/:taskId/cancel') cancelTask(
    @Param('taskId') taskId: string,
    @Body() body: CommandBody,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:execute');
    return this.service.runtime.cancelTask(
      taskId,
      context,
      this.service.metadata(body, { userId, idempotencyKey }),
    );
  }

  private command(
    workflowId: string,
    body: CommandBody,
    tenantId: string | undefined,
    userId: string | undefined,
    idempotencyKey: string | undefined,
    action: 'start' | 'pause' | 'resume' | 'cancel',
  ) {
    const context = this.service.context(tenantId, userId);
    this.service.authorize(context, 'workflow:execute');
    const metadata = this.service.metadata(body, { userId, idempotencyKey });
    return this.service.runtime[action](workflowId, context, metadata);
  }
}
