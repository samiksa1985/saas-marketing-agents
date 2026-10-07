import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { TenantContext } from '@platform/contracts';
import { createStructuredLogger, platformMetrics } from '@platform/observability';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import {
  TenantLifecycleError,
  TenantLifecycleService,
  buildAcceptancePack,
  type DesignPartnerRequestInput,
} from './tenant-lifecycle.service.js';

const logger = createStructuredLogger('api');
export const TENANT_LIFECYCLE_SERVICE_TOKEN = Symbol('TENANT_LIFECYCLE_SERVICE');

interface CreateRequestBody {
  slug?: string;
  displayName?: string;
  designPartnerRef?: string;
  adminSubject?: string;
  adminDisplayName?: string;
  capabilities?: Record<string, unknown>;
  providerConnection?: boolean;
  providerReadOnly?: boolean;
  providerValidateOnly?: boolean;
  providerLiveMutation?: boolean;
  maxActiveWorkflows?: number;
  maxMembers?: number;
  maxProviderConnections?: number;
  dispatchConcurrency?: number;
  idempotencyKey?: string;
  expiresAt?: string;
}

interface TransitionBody {
  approvalId?: string;
  reason?: string;
}

/**
 * Controlled design-partner lifecycle controller. Provisioning is a
 * privileged control-plane action requiring platform:provision, which no
 * tenant-scoped role possesses. Tenant-local status reads require artifact
 * read; tenant admins cannot provision or transition tenants.
 */
@Controller('/design-partners')
@UseGuards(ApiAuthGuard)
export class TenantLifecycleController {
  constructor(
    @Inject(TENANT_LIFECYCLE_SERVICE_TOKEN) private readonly lifecycle: TenantLifecycleService,
  ) {}

  private context(request: unknown): TenantContext {
    return getAuthContext(request as AuthenticatedRequest);
  }

  private requirePlatform(context: TenantContext): void {
    try {
      authorize(context, 'platform:provision');
    } catch {
      platformMetrics.recordSignal('authorization', 'rejected');
      logger.emit('warn', 'security.authorization.rejected', { permission: 'platform:provision' });
      throw new ForbiddenException('Platform provisioning permission is required');
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof TenantLifecycleError) {
      platformMetrics.recordSignal('workflow', 'rejected');
      logger.emit('warn', 'tenant.lifecycle_rejected', { code: error.code });
      if (error.code === 'DESIGN_PARTNER_REQUEST_NOT_FOUND' || error.code === 'TENANT_NOT_FOUND') {
        throw new NotFoundException(error.code);
      }
      if (error.code === 'TENANT_LIFECYCLE_TRANSITION_INVALID') {
        throw new ConflictException(error.code);
      }
      throw new BadRequestException(error.code);
    }
    throw error;
  }

  @Post('/requests')
  async createRequest(@Req() request: unknown, @Body() body: CreateRequestBody) {
    const context = this.context(request);
    this.requirePlatform(context);
    try {
      if (
        !body?.slug || !body.displayName || !body.designPartnerRef ||
        !body.adminSubject || !body.adminDisplayName || !body.idempotencyKey
      ) {
        throw new BadRequestException('slug, displayName, designPartnerRef, adminSubject, adminDisplayName, and idempotencyKey are required');
      }
      if (body.providerLiveMutation === true) {
        throw new BadRequestException('Provider live mutation cannot be requested');
      }
      const input: DesignPartnerRequestInput = {
        slug: body.slug,
        displayName: body.displayName,
        designPartnerRef: body.designPartnerRef,
        adminSubject: body.adminSubject,
        adminDisplayName: body.adminDisplayName,
        requestedBy: context.userId ?? 'platform-operator',
        idempotencyKey: body.idempotencyKey,
        ...(body.capabilities ? { capabilities: body.capabilities } : {}),
        ...(body.providerConnection !== undefined ? { providerConnection: body.providerConnection } : {}),
        ...(body.providerReadOnly !== undefined ? { providerReadOnly: body.providerReadOnly } : {}),
        ...(body.providerValidateOnly !== undefined ? { providerValidateOnly: body.providerValidateOnly } : {}),
        ...(body.maxActiveWorkflows !== undefined ? { maxActiveWorkflows: body.maxActiveWorkflows } : {}),
        ...(body.maxMembers !== undefined ? { maxMembers: body.maxMembers } : {}),
        ...(body.maxProviderConnections !== undefined ? { maxProviderConnections: body.maxProviderConnections } : {}),
        ...(body.dispatchConcurrency !== undefined ? { dispatchConcurrency: body.dispatchConcurrency } : {}),
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      };
      const created = await this.lifecycle.createRequest(input);
      platformMetrics.recordSignal('workflow', 'started');
      logger.emit('info', 'tenant.request_created', { slug: created.slug });
      return created;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('/requests/:requestId')
  async getRequest(@Req() request: unknown, @Param('requestId') requestId: string) {
    const context = this.context(request);
    this.requirePlatform(context);
    try {
      return await this.lifecycle.getRequest(requestId);
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/requests/:requestId/qualify')
  async qualify(@Req() request: unknown, @Param('requestId') requestId: string) {
    const context = this.context(request);
    this.requirePlatform(context);
    try {
      return await this.lifecycle.qualify(requestId, context.userId ?? 'platform-operator');
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/requests/:requestId/approve')
  async approve(@Req() request: unknown, @Param('requestId') requestId: string, @Body() body: TransitionBody) {
    const context = this.context(request);
    this.requirePlatform(context);
    if (!body?.approvalId) throw new BadRequestException('approvalId is required');
    try {
      return await this.lifecycle.approve(requestId, context.userId ?? 'platform-operator', body.approvalId);
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/requests/:requestId/provision')
  async provision(@Req() request: unknown, @Param('requestId') requestId: string) {
    const context = this.context(request);
    this.requirePlatform(context);
    try {
      const result = await this.lifecycle.provision(requestId, context.userId ?? 'platform-operator');
      await this.lifecycle.bootstrapAdmin(requestId, context.userId ?? 'platform-operator');
      platformMetrics.recordSignal('workflow', 'succeeded');
      logger.emit('info', 'tenant.provisioned', { requestId });
      return result;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('/tenants/:tenantId/status')
  async status(@Req() request: unknown, @Param('tenantId') tenantId: string) {
    const context = this.context(request);
    // Tenant-local read requires artifact read; cross-tenant reads are denied
    // by the resolver/RLS and the explicit tenant match below.
    try {
      authorize(context, 'artifact:read');
    } catch {
      throw new ForbiddenException('artifact:read is required');
    }
    if (context.tenantId !== tenantId && !context.permissions.includes('platform:provision')) {
      throw new ForbiddenException('Cross-tenant status is denied');
    }
    try {
      return await this.lifecycle.getTenantStatus(tenantId);
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('/tenants/:tenantId/acceptance-pack')
  async acceptancePack(@Req() request: unknown, @Param('tenantId') tenantId: string) {
    const context = this.context(request);
    try {
      authorize(context, 'audit:read');
    } catch {
      throw new ForbiddenException('audit:read is required');
    }
    if (context.tenantId !== tenantId && !context.permissions.includes('platform:provision')) {
      throw new ForbiddenException('Cross-tenant acceptance evidence is denied');
    }
    try {
      const status = await this.lifecycle.getTenantStatus(tenantId);
      const requests = status.recentEvents;
      void requests;
      return buildAcceptancePack(status, '');
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/tenants/:tenantId/suspend')
  async suspend(@Req() request: unknown, @Param('tenantId') tenantId: string, @Body() body: TransitionBody) {
    const context = this.context(request);
    this.requirePlatform(context);
    try {
      const result = await this.lifecycle.suspend(tenantId, context.userId ?? 'platform-operator', body?.reason ?? 'operator suspension', body?.approvalId);
      platformMetrics.recordSignal('workflow', 'blocked');
      logger.emit('warn', 'tenant.suspended', { tenantLifecycle: 'SUSPENDED' });
      return result;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/tenants/:tenantId/resume')
  async resume(@Req() request: unknown, @Param('tenantId') tenantId: string) {
    const context = this.context(request);
    this.requirePlatform(context);
    try {
      return await this.lifecycle.resume(tenantId, context.userId ?? 'platform-operator');
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/tenants/:tenantId/offboard')
  async offboard(@Req() request: unknown, @Param('tenantId') tenantId: string, @Body() body: TransitionBody) {
    const context = this.context(request);
    this.requirePlatform(context);
    try {
      const result = await this.lifecycle.offboard(tenantId, context.userId ?? 'platform-operator', body?.reason ?? 'operator offboarding');
      platformMetrics.recordSignal('workflow', 'succeeded');
      logger.emit('warn', 'tenant.offboarded', { tenantLifecycle: 'OFFBOARDED' });
      return result;
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('/tenants/:tenantId/ready')
  async ready(@Req() request: unknown, @Param('tenantId') tenantId: string) {
    const context = this.context(request);
    this.requirePlatform(context);
    try {
      return await this.lifecycle.markReady(tenantId, context.userId ?? 'platform-operator');
    } catch (error) {
      this.handleError(error);
    }
  }
}
