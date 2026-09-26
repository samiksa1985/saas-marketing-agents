import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { authorize } from '@platform/auth';
import {
  PRODUCT_SURFACE_IDS,
  type ProductSurfaceComposition,
  type ProductSurfaceId,
  type TenantContext,
} from '@platform/contracts';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { ApprovalApiService } from './approval.controller.js';
import { RegistryService } from './registry.controller.js';

type SurfaceRule = {
  permission: Parameters<typeof authorize>[1];
  source: string;
  entitlement?: string;
};

const rules: Record<ProductSurfaceId, SurfaceRule> = {
  home: { permission: 'tenant:read', source: 'canonical operating composition' },
  'ai-command': { permission: 'workflow:read', source: 'marketing-os command composition' },
  'company-intelligence': { permission: 'tenant:read', source: '@platform/company-intelligence' },
  'market-intelligence': { permission: 'tenant:read', source: '@platform/market-intelligence' },
  'icp-personas': { permission: 'tenant:read', source: '@platform/company-intelligence ICP' },
  strategy: { permission: 'artifact:read', source: '@platform/strategy' },
  campaigns: { permission: 'marketing:admin', source: '@platform/marketing-os-execution' },
  'content-studio': { permission: 'artifact:read', source: '@platform/marketing-execution' },
  'creative-studio': { permission: 'artifact:read', source: '@platform/marketing-execution' },
  seo: { permission: 'marketing:admin', source: '@platform/marketing-execution' },
  'sales-crm': { permission: 'sales:admin', source: '@platform/sales-intelligence' },
  'customer-success': { permission: 'customer_success:admin', source: '@platform/customer-success' },
  'analytics-experiments': { permission: 'tenant:read', source: '@platform/measurement-engine' },
  'finance-cfo': { permission: 'finance:admin', source: '@marketing-os/cfo-intelligence' },
  automation: { permission: 'automation:admin', source: '@platform/automation' },
  knowledge: { permission: 'artifact:read', source: '@platform/context-engine' },
  approvals: { permission: 'approval:decide', source: '@platform/approvals' },
  'workflows-operations': { permission: 'workflow:read', source: '@platform/workflow-runtime query' },
  'ai-team': { permission: 'workflow:read', source: '@platform/registry' },
  'business-mentor': { permission: 'tenant:read', source: '@platform/business-mentor' },
  'billing-usage': { permission: 'billing:admin', source: '@platform/billing-entitlements', entitlement: 'billing-usage' },
  settings: { permission: 'organization:read', source: '@platform/admin governance' },
  'admin-governance': { permission: 'organization:manage', source: '@platform/governance' },
};

function isSurface(value: string): value is ProductSurfaceId {
  return (PRODUCT_SURFACE_IDS as readonly string[]).includes(value);
}

@Injectable()
export class ProductSurfaceService {
  constructor(
    private readonly registry: RegistryService,
    private readonly approvals: ApprovalApiService,
  ) {}

  async get(context: TenantContext, surface: ProductSurfaceId): Promise<ProductSurfaceComposition> {
    const rule = rules[surface];
    authorize(context, rule.permission);

    if (surface === 'ai-team') {
      return { surface, state: 'ready', source: rule.source, data: await this.registry.agents() };
    }

    if (surface === 'approvals') {
      return {
        surface,
        state: 'ready',
        source: rule.source,
        data: await this.approvals.list(context),
      };
    }

    if (surface === 'billing-usage') {
      return {
        surface,
        state: 'unavailable',
        source: rule.source,
        requiredEntitlement: 'billing-usage',
        reason: 'An authoritative billing repository must be injected before tenant usage can be read.',
      };
    }

    return {
      surface,
      state: 'empty',
      source: rule.source,
      ...(rule.entitlement ? { requiredEntitlement: rule.entitlement } : {}),
      reason: 'No tenant-bound record was requested; the canonical composition is available without fabricated data.',
    };
  }
}

@Controller('product-surfaces')
@UseGuards(ApiAuthGuard)
export class ProductSurfaceController {
  constructor(private readonly surfaces: ProductSurfaceService) {}

  @Get(':surface')
  async get(@Param('surface') surface: string, @Req() request: unknown) {
    if (!isSurface(surface)) {
      throw new ForbiddenException('Unknown product surface');
    }

    try {
      return await this.surfaces.get(
        getAuthContext(request as AuthenticatedRequest),
        surface,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }
}
