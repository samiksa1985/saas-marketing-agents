import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import {
  authorize,
} from '@platform/auth';

import type {
  Locale,
  Permission,
  TenantContext,
} from '@platform/contracts';

import {
  TenantIsolationError,
  createWorkflowRuntime,
  type TransitionMetadata,
  type WorkflowRuntime,
  type WorkflowRuntimeQuery,
  type WorkflowRuntimeSelection,
  type WorkflowTaskCommandRuntime,
} from '@platform/workflow-runtime';

import {
  ApiAuthGuard,
  getAuthContext,
  type AuthenticatedRequest,
} from './auth.guard.js';

interface WorkflowBody {
  engagementId:
    string;

  locale?:
    Locale;

  selectedWorkstreamIds:
    string[];

  idempotencyKey?:
    string;

  reason?:
    string;
}

interface CommandBody {
  reason?:
    string;

  idempotencyKey?:
    string;

  workerId?:
    string;

  defects?: Array<{
    code:
      string;

    message:
      string;

    field?:
      string;
  }>;
}

function apiRequest(
  request:
    unknown,
): AuthenticatedRequest {
  return request as
    AuthenticatedRequest;
}

@Catch(
  TenantIsolationError,
)
class TenantIsolationExceptionFilter
  implements
    ExceptionFilter<TenantIsolationError> {
  catch(
    _exception:
      TenantIsolationError,
    host:
      ArgumentsHost,
  ): void {
    const response =
      host
        .switchToHttp()
        .getResponse();

    response
      .status(403)
      .json({
        statusCode:
          403,

        message:
          'Cross-tenant access denied',
      });
  }
}

@Injectable()
export class WorkflowApiService {
  /** Commands are provider-neutral; production selection supplies Temporal. */
  runtime: WorkflowRuntime;

  /** All API read endpoints use this durable-query boundary. */
  query: WorkflowRuntimeQuery;

  private taskCommands: WorkflowTaskCommandRuntime | undefined;

  constructor() {
    const selection = createWorkflowRuntime({
      mode: 'in-memory',
    });
    this.runtime = selection.runtime;
    this.query = selection.query;
    this.taskCommands = selection.taskCommands;
  }

  configureRuntime(selection: WorkflowRuntimeSelection): void {
    this.runtime = selection.runtime;
    this.query = selection.query;
    this.taskCommands = selection.taskCommands;
  }

  commands(): WorkflowTaskCommandRuntime {
    if (!this.taskCommands) {
      throw new Error(
        'Selected workflow provider does not expose task command operations',
      );
    }

    return this.taskCommands;
  }

  context(
    request:
      AuthenticatedRequest,
  ): TenantContext {
    return getAuthContext(
      request,
    );
  }

  authorize(
    context:
      TenantContext,
    permission:
      Permission,
  ): TenantContext {
    try {
      return authorize(
        context,
        permission,
      );
    } catch (
      error
    ) {
      if (
        error instanceof
        Error
      ) {
        throw new ForbiddenException(
          error.message,
        );
      }

      throw new ForbiddenException(
        `Missing permission: ${permission}`,
      );
    }
  }

  metadata(
    body:
      | CommandBody
      | undefined,

    context:
      TenantContext,

    headerIdempotencyKey:
      string | undefined,
  ): TransitionMetadata {
    return {
      actor:
        context.userId ??
        'api-user',

      reason:
        body?.reason ??
        'API command',

      timestamp:
        new Date().toISOString(),

      idempotencyKey:
        body?.idempotencyKey ??
        headerIdempotencyKey ??
        `api-${Date.now()}`,
    };
  }
}

@Controller()
@UseGuards(
  ApiAuthGuard,
)
@UseFilters(
  TenantIsolationExceptionFilter,
)
export class WorkflowController {
  constructor(
    @Inject(
      WorkflowApiService,
    )
    private readonly service:
      WorkflowApiService,
  ) {}

  @Post(
    '/workflows',
  )
  async create(
    @Body()
    body:
      WorkflowBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:execute',
    );

    if (
      !body?.engagementId ||
      !Array.isArray(
        body.selectedWorkstreamIds,
      )
    ) {
      throw new BadRequestException(
        'engagementId and selectedWorkstreamIds are required',
      );
    }

    return this.service.runtime
      .createWorkflow({
        tenantId:
          context.tenantId,

        engagementId:
          body.engagementId,

        locale:
          body.locale ??
          context.locale,

        selectedWorkstreamIds:
          body.selectedWorkstreamIds,

        idempotencyKey:
          body.idempotencyKey ??
          idempotencyKey ??
          `create-${Date.now()}`,
      });
  }

  @Get(
    '/workflows/:workflowId',
  )
  async get(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Req()
    request:
      unknown,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:read',
    );

    try {
      return await this.service.query
      .getWorkflow(
        workflowId,
        context,
      );

    } catch (
      error
    ) {
      if (
        error instanceof Error &&
        error.message ===
          'Workflow not found'
      ) {
        throw new NotFoundException(
          'Workflow not found',
        );
      }

      throw error;
    }
  }

  @Post(
    '/workflows/:workflowId/start',
  )
  start(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Body()
    body:
      CommandBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    return this.command(
      workflowId,
      body,
      apiRequest(
        request,
      ),
      idempotencyKey,
      'start',
    );
  }

  @Post(
    '/workflows/:workflowId/pause',
  )
  pause(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Body()
    body:
      CommandBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    return this.command(
      workflowId,
      body,
      apiRequest(
        request,
      ),
      idempotencyKey,
      'pause',
    );
  }

  @Post(
    '/workflows/:workflowId/resume',
  )
  resume(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Body()
    body:
      CommandBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    return this.command(
      workflowId,
      body,
      apiRequest(
        request,
      ),
      idempotencyKey,
      'resume',
    );
  }

  @Post(
    '/workflows/:workflowId/cancel',
  )
  cancel(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Body()
    body:
      CommandBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    return this.command(
      workflowId,
      body,
      apiRequest(
        request,
      ),
      idempotencyKey,
      'cancel',
    );
  }

  @Get(
    '/workflows/:workflowId/readiness',
  )
  async readiness(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Req()
    request:
      unknown,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:read',
    );

    const tasks = await this.service.query
      .getTasks(
        workflowId,
        context,
      );

    return Promise.all(
      tasks.map(
        (
          task,
        ) => (async () => ({
          taskId:
            task.id,

          workstreamId:
            task.workstreamId,

          readiness: await this.service.query
              .getTaskReadiness(
                task.id,
                context,
              ),
        }))(),
      ),
    );
  }

  @Get(
    '/workflows/:workflowId/tasks',
  )
  async tasks(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Req()
    request:
      unknown,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:read',
    );

    return this.service.query
      .getTasks(
        workflowId,
        context,
      );
  }

  @Get(
    '/workflows/:workflowId/artifacts',
  )
  async artifacts(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Req()
    request:
      unknown,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'artifact:read',
    );

    return this.service.query
      .getArtifacts(
        workflowId,
        context,
      );
  }

  @Get(
    '/workflows/:workflowId/handoffs',
  )
  async handoffs(
    @Param(
      'workflowId',
    )
    workflowId:
      string,

    @Req()
    request:
      unknown,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:read',
    );

    return this.service.query
      .getHandoffs(
        workflowId,
        context,
      );
  }

  @Post(
    '/tasks/:taskId/claim',
  )
  claim(
    @Param(
      'taskId',
    )
    taskId:
      string,

    @Body()
    body:
      CommandBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:execute',
    );

    if (
      !body?.workerId
    ) {
      throw new BadRequestException(
        'workerId is required',
      );
    }

    const metadata =
      this.service.metadata(
        body,
        context,
        idempotencyKey,
      );

    return this.service.commands()
      .claimTask(
        taskId,
        body.workerId,
        metadata.idempotencyKey,
        context,
        metadata,
      );
  }

  @Post(
    '/tasks/:taskId/retry',
  )
  retry(
    @Param(
      'taskId',
    )
    taskId:
      string,

    @Body()
    body:
      CommandBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:execute',
    );

    return this.service.commands()
      .retryTask(
        taskId,
        context,
        this.service.metadata(
          body,
          context,
          idempotencyKey,
        ),
      );
  }

  @Post(
    '/tasks/:taskId/repair',
  )
  repair(
    @Param(
      'taskId',
    )
    taskId:
      string,

    @Body()
    body:
      CommandBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:execute',
    );

    return this.service.commands()
      .repairTask(
        taskId,
        context,
        this.service.metadata(
          body,
          context,
          idempotencyKey,
        ),
      );
  }

  @Post(
    '/tasks/:taskId/cancel',
  )
  cancelTask(
    @Param(
      'taskId',
    )
    taskId:
      string,

    @Body()
    body:
      CommandBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    idempotencyKey?:
      string,
  ) {
    const context =
      this.service.context(
        apiRequest(
          request,
        ),
      );

    this.service.authorize(
      context,
      'workflow:execute',
    );

    return this.service.commands()
      .cancelTask(
        taskId,
        context,
        this.service.metadata(
          body,
          context,
          idempotencyKey,
        ),
      );
  }

  private command(
    workflowId:
      string,

    body:
      CommandBody,

    request:
      AuthenticatedRequest,

    idempotencyKey:
      | string
      | undefined,

    action:
      | 'start'
      | 'pause'
      | 'resume'
      | 'cancel',
  ) {
    const context =
      this.service.context(
        request,
      );

    this.service.authorize(
      context,
      'workflow:execute',
    );

    const metadata =
      this.service.metadata(
        body,
        context,
        idempotencyKey,
      );

    return this.service.runtime[
      action
    ](
      workflowId,
      context,
      metadata,
    );
  }
}
