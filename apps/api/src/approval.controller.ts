import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  createHash,
} from 'node:crypto';

import type {
  Approval,
  ApprovalDecision,
  TenantContext,
} from '@platform/contracts';

import {
  authorize,
} from '@platform/auth';

import {
  ApiAuthGuard,
  getAuthContext,
  type AuthenticatedRequest,
} from './auth.guard.js';

interface CreateApprovalBody {
  artifactId:
    string;

  expiresAt?:
    string;

  conditions?:
    string[];

  idempotencyKey?:
    string;
}

interface DecideApprovalBody {
  decision:
    ApprovalDecision;

  conditions?:
    string[];

  idempotencyKey?:
    string;
}

export interface ApprovalRecord
  extends Approval {
  createdAt:
    string;

  updatedAt:
    string;

  requestedByUserId?:
    string;

  decisionIdempotencyKey?:
    string;
}

function apiRequest(
  request:
    unknown,
): AuthenticatedRequest {
  return request as
    AuthenticatedRequest;
}

function buildApprovalId(
  tenantId:
    string,

  artifactId:
    string,

  idempotencyKey:
    string,
): string {
  return `approval-${createHash(
    'sha256',
  )
    .update(
      `${tenantId}:${artifactId}:${idempotencyKey}`,
    )
    .digest('hex')
    .slice(0, 32)}`;
}

function withOptionalString(
  target:
    Record<string, unknown>,

  key:
    string,

  value:
    string | undefined,
): void {
  if (
    value !== undefined
  ) {
    target[key] =
      value;
  }
}

function withOptionalArray(
  target:
    Record<string, unknown>,

  key:
    string,

  value:
    string[] | undefined,
): void {
  if (
    value !== undefined
  ) {
    target[key] = [
      ...value,
    ];
  }
}

@Injectable()
export class ApprovalApiService {
  private readonly approvals =
    new Map<
      string,
      ApprovalRecord
    >();

  private readonly idempotency =
    new Map<
      string,
      string
    >();

  create(
    context:
      TenantContext,

    input:
      CreateApprovalBody,
  ): ApprovalRecord {
    const idempotencyKey =
      input.idempotencyKey ??
      `approval-${Date.now()}`;

    const lookup =
      `${context.tenantId}:${idempotencyKey}`;

    const existingId =
      this.idempotency.get(
        lookup,
      );

    if (
      existingId !== undefined
    ) {
      const existing =
        this.approvals.get(
          existingId,
        );

      if (
        existing !== undefined
      ) {
        return existing;
      }
    }

    const timestamp =
      new Date().toISOString();

    const recordData:
      Record<string, unknown> = {
      id:
        buildApprovalId(
          context.tenantId,
          input.artifactId,
          idempotencyKey,
        ),

      tenantId:
        context.tenantId,

      artifactId:
        input.artifactId,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,
    };

    withOptionalString(
      recordData,
      'expiresAt',
      input.expiresAt,
    );

    withOptionalArray(
      recordData,
      'conditions',
      input.conditions,
    );

    withOptionalString(
      recordData,
      'requestedByUserId',
      context.userId,
    );

    const record =
      recordData as
        unknown as
        ApprovalRecord;

    this.approvals.set(
      record.id,
      record,
    );

    this.idempotency.set(
      lookup,
      record.id,
    );

    return record;
  }

  get(
    approvalId:
      string,

    context:
      TenantContext,
  ): ApprovalRecord {
    const record =
      this.approvals.get(
        approvalId,
      );

    if (
      record === undefined
    ) {
      throw new NotFoundException(
        'Approval not found',
      );
    }

    if (
      record.tenantId !==
      context.tenantId
    ) {
      throw new ForbiddenException(
        'Cross-tenant access denied',
      );
    }

    return record;
  }

  decide(
    approvalId:
      string,

    context:
      TenantContext,

    input:
      DecideApprovalBody,
  ): ApprovalRecord {
    const record =
      this.get(
        approvalId,
        context,
      );

    if (
      record.expiresAt !==
        undefined &&
      new Date(
        record.expiresAt,
      ) <=
        new Date()
    ) {
      throw new ConflictException(
        'Approval has expired',
      );
    }

    if (
      record.decision !==
      undefined
    ) {
      if (
        record.decisionIdempotencyKey !==
          undefined &&
        input.idempotencyKey !==
          undefined &&
        record.decisionIdempotencyKey ===
          input.idempotencyKey
      ) {
        return record;
      }

      throw new ConflictException(
        'Approval already has a decision',
      );
    }

    if (
      input.decision ===
        'approved_with_conditions' &&
      (
        input.conditions ===
          undefined ||
        input.conditions.length ===
          0
      )
    ) {
      throw new BadRequestException(
        'conditions are required for approved_with_conditions',
      );
    }

    if (
      input.decision !==
        'approved_with_conditions' &&
      input.conditions !==
        undefined &&
      input.conditions.length >
        0
    ) {
      throw new BadRequestException(
        'conditions are only valid for approved_with_conditions',
      );
    }

    record.decision =
      input.decision;

    if (
      input.conditions !==
      undefined
    ) {
      record.conditions = [
        ...input.conditions,
      ];
    } else {
      delete record.conditions;
    }

    if (
      context.userId !==
      undefined
    ) {
      record.approverUserId =
        context.userId;
    } else {
      delete record.approverUserId;
    }

    if (
      input.idempotencyKey !==
      undefined
    ) {
      record.decisionIdempotencyKey =
        input.idempotencyKey;
    } else {
      delete record.decisionIdempotencyKey;
    }

    record.updatedAt =
      new Date().toISOString();

    return record;
  }

  list(
    context:
      TenantContext,
  ): ApprovalRecord[] {
    return [
      ...this.approvals.values(),
    ].filter(
      (
        approval,
      ) =>
        approval.tenantId ===
        context.tenantId,
    );
  }
}

@Controller()
@UseGuards(
  ApiAuthGuard,
)
export class ApprovalController {
  constructor(
    @Inject(
      ApprovalApiService,
    )
    private readonly approvals:
      ApprovalApiService,
  ) {}

  @Post(
    '/approvals',
  )
  create(
    @Body()
    body:
      CreateApprovalBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    headerIdempotencyKey?:
      string,
  ): ApprovalRecord {
    const context =
      this.context(
        apiRequest(
          request,
        ),
      );

    this.authorize(
      context,
      'workflow:execute',
    );

    if (
      !body?.artifactId
    ) {
      throw new BadRequestException(
        'artifactId is required',
      );
    }

    const input:
      CreateApprovalBody = {
      artifactId:
        body.artifactId,
    };

    if (
      body.expiresAt !==
      undefined
    ) {
      input.expiresAt =
        body.expiresAt;
    }

    if (
      body.conditions !==
      undefined
    ) {
      input.conditions = [
        ...body.conditions,
      ];
    }

    const effectiveIdempotencyKey =
      body.idempotencyKey ??
      headerIdempotencyKey;

    if (
      effectiveIdempotencyKey !==
      undefined
    ) {
      input.idempotencyKey =
        effectiveIdempotencyKey;
    }

    return this.approvals.create(
      context,
      input,
    );
  }

  @Get(
    '/approvals',
  )
  list(
    @Req()
    request:
      unknown,
  ): ApprovalRecord[] {
    const context =
      this.context(
        apiRequest(
          request,
        ),
      );

    this.authorizeAny(
      context,
      [
        'artifact:read',
        'approval:decide',
      ],
    );

    return this.approvals.list(
      context,
    );
  }

  @Get(
    '/approvals/:approvalId',
  )
  get(
    @Param(
      'approvalId',
    )
    approvalId:
      string,

    @Req()
    request:
      unknown,
  ): ApprovalRecord {
    const context =
      this.context(
        apiRequest(
          request,
        ),
      );

    this.authorizeAny(
      context,
      [
        'artifact:read',
        'approval:decide',
      ],
    );

    return this.approvals.get(
      approvalId,
      context,
    );
  }

  @Post(
    '/approvals/:approvalId/decision',
  )
  decide(
    @Param(
      'approvalId',
    )
    approvalId:
      string,

    @Body()
    body:
      DecideApprovalBody,

    @Req()
    request:
      unknown,

    @Headers(
      'idempotency-key',
    )
    headerIdempotencyKey?:
      string,
  ): ApprovalRecord {
    const context =
      this.context(
        apiRequest(
          request,
        ),
      );

    this.authorize(
      context,
      'approval:decide',
    );

    const validDecisions:
      ApprovalDecision[] = [
      'approved',
      'approved_with_conditions',
      'rejected',
      'expired',
    ];

    if (
      !body?.decision
    ) {
      throw new BadRequestException(
        'decision is required',
      );
    }

    if (
      !validDecisions.includes(
        body.decision,
      )
    ) {
      throw new BadRequestException(
        'Invalid approval decision',
      );
    }

    const input:
      DecideApprovalBody = {
      decision:
        body.decision,
    };

    if (
      body.conditions !==
      undefined
    ) {
      input.conditions = [
        ...body.conditions,
      ];
    }

    const effectiveIdempotencyKey =
      body.idempotencyKey ??
      headerIdempotencyKey;

    if (
      effectiveIdempotencyKey !==
      undefined
    ) {
      input.idempotencyKey =
        effectiveIdempotencyKey;
    }

    return this.approvals.decide(
      approvalId,
      context,
      input,
    );
  }

  private context(
    request:
      AuthenticatedRequest,
  ): TenantContext {
    return getAuthContext(
      request,
    );
  }

  private authorize(
    context:
      TenantContext,

    permission:
      | 'workflow:execute'
      | 'approval:decide'
      | 'artifact:read',
  ): void {
    try {
      authorize(
        context,
        permission,
      );
    } catch (
      error
    ) {
      throw new ForbiddenException(
        error instanceof Error
          ? error.message
          : `Missing permission: ${permission}`,
      );
    }
  }

  private authorizeAny(
    context:
      TenantContext,

    permissions:
      Array<
        | 'artifact:read'
        | 'approval:decide'
      >,
  ): void {
    for (
      const permission of
        permissions
    ) {
      try {
        authorize(
          context,
          permission,
        );

        return;
      } catch {
        // Try the next permission.
      }
    }

    throw new ForbiddenException(
      'Missing approval read permission',
    );
  }
}
