import 'reflect-metadata';
import { Controller, Get, Headers, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@platform/config';
import { createDb } from '@platform/db';
import { createWorkflowRuntime } from '@platform/workflow-runtime';
import { createLocaleContext, supportedLocales, type Locale } from '@platform/i18n';
import type { AuthProvider } from '@platform/auth';
import {
  REGISTRY_SERVICE,
  RegistryController,
  RegistryService,
} from './registry.controller.js';
import {
  WORKFLOW_RUNTIME_SELECTION,
  WorkflowApiService,
  WorkflowController,
} from './workflow.controller.js';
import { MarketingOsController } from './marketing-os.controller.js';
import {
  createMarketingOsApplicationService,
  MarketingOsApplicationService,
} from './marketing-os.application.js';
import { ApprovalApiService, ApprovalController } from './approval.controller.js';
import { DURABLE_APPROVAL_REPOSITORY } from './approval.controller.js';
import { InMemoryDurableApprovalRepository } from '@platform/approvals';
import { AUTH_PROVIDER, ApiAuthGuard } from './auth.guard.js';
import { ApiTenantDurableApprovalRepository } from './durable-approval.repository.js';
import { ApiTenantDatabase } from './tenant-database.js';
import { ProductSurfaceController, ProductSurfaceService } from './product-surface.controller.js';
import { ExternalActionsController } from './external-actions.controller.js';
import { UnifiedCampaignsController } from './unified-campaigns.controller.js';
import { PerformanceOptimizationController } from './performance-optimization.controller.js';
import { CustomerAcquisitionRevenueController } from './customer-acquisition-revenue.controller.js';
import { CustomerEngagementController } from './customer-engagement.controller.js';
import { ExternalActionPoliciesController } from './external-action-policies.controller.js';
import {
  ExternalActionOperationsController,
  EXTERNAL_ACTION_OPERATIONS_APPLICATION_SERVICE,
} from './external-action-operations.controller.js';
import { ExternalActionOperationsApplicationService } from './external-action-operations.application.js';
import {
  EXTERNAL_ACTION_APPLICATION_SERVICE,
  ExternalActionApplicationService,
} from './external-actions.application.js';
import {
  UNIFIED_CAMPAIGN_APPLICATION_SERVICE,
  UnifiedCampaignApplicationService,
} from './unified-campaigns.application.js';
import {
  PERFORMANCE_OPTIMIZATION_APPLICATION_SERVICE,
  PerformanceOptimizationApplicationService,
} from './performance-optimization.application.js';
import {
  CUSTOMER_ACQUISITION_REVENUE_APPLICATION_SERVICE,
  CustomerAcquisitionRevenueApplicationService,
} from './customer-acquisition-revenue.application.js';
import {
  CUSTOMER_ENGAGEMENT_APPLICATION_SERVICE,
  CustomerEngagementApplicationService,
} from './customer-engagement.application.js';
import { createApiAuthProvider } from './auth-provider.factory.js';
import {
  EnvironmentGoogleAdsCredentialResolver,
  GoogleAdsApiAdapter,
  GoogleAdsRestTransport,
  GoogleAdsProviderGateway,
  MockGoogleAdsProvider,
  EnvironmentMetaAdsCredentialResolver,
  MetaAdsApiAdapter,
  MetaAdsRestTransport,
  MetaAdsProviderGateway,
  MockMetaAdsProvider,
  ExternalActionProviderRegistry,
} from '@platform/tool-gateway';
import {
  GOOGLE_ADS_MUTATION_TYPES,
  META_ADS_MUTATION_TYPES,
} from '@platform/marketing-os-core';

export const API_TENANT_DATABASE = Symbol('API_TENANT_DATABASE');

@Injectable() class AppService {
  health(){return {status:'ok',service:'api'};}
  readiness(){return {status:'ready',database:'configured',workflow:'configured'};}
}
@Controller() class AppController {
  constructor(private readonly app:AppService){}
  @Get('/health') health(){return this.app.health();}
  @Get('/ready') ready(){return this.app.readiness();}
  @Get('/i18n/context') context(@Headers('accept-language') language?:string){
    const locale=(supportedLocales.find((item)=>language?.includes(item))??'en') as Locale;
    return createLocaleContext(locale);
  }
}
const config=loadConfig();
// Build the single workflow provider before Nest composition. Temporal mode is
// deliberately fail-closed until deployment injects both command and read adapters.
const workflowRuntime = createWorkflowRuntime({
  mode: config.workflowRuntimeMode,
});
// This factory only creates a client; a connection is opened by an actual query.
// Tenant-bound persistence code receives the scoped transaction through the
// API_TENANT_DATABASE façade instead of using this client directly.
const database = createDb(config.databaseUrl);
const tenantDatabase = new ApiTenantDatabase(database);
// Production, durable-workflow composition, and explicit local acceptance
// rehearsal recover approvals after an API restart. The in-memory repository
// remains the default local/dev fallback.
const durableApprovals =
  config.nodeEnv === 'production' ||
  workflowRuntime.durable ||
  config.localAcceptanceDurableApprovals
    ? new ApiTenantDurableApprovalRepository(tenantDatabase)
    : new InMemoryDurableApprovalRepository();
// Provider configuration is composed here, never in a controller or agent.
// MOCK is rejected by loadConfig in production; REAL remains disabled unless
// explicitly enabled and its transport/credentials validate inside the gateway.
const googleAdsProvider =
  config.googleAdsExecutionMode === 'MOCK'
    ? new MockGoogleAdsProvider()
    : new GoogleAdsApiAdapter(
      new EnvironmentGoogleAdsCredentialResolver(),
      new GoogleAdsRestTransport({ apiVersion: config.googleAdsApiVersion }),
    );
const googleAdsGateway = new GoogleAdsProviderGateway(
  googleAdsProvider,
  config.googleAdsExecutionMode,
  config.googleAdsExecutionEnabled,
  undefined,
  {
    ...(config.googleAdsApprovedCustomerId ? { approvedCustomerId: config.googleAdsApprovedCustomerId } : {}),
    sandboxCustomerIds: config.googleAdsSandboxCustomerIds,
  },
);
const metaAdsProvider =
  config.metaAdsExecutionMode === 'MOCK'
    ? new MockMetaAdsProvider()
    : new MetaAdsApiAdapter(
      new EnvironmentMetaAdsCredentialResolver(),
      new MetaAdsRestTransport({ apiVersion: config.metaAdsApiVersion }),
    );
const metaAdsGateway = new MetaAdsProviderGateway(
  metaAdsProvider,
  config.metaAdsExecutionMode,
  config.metaAdsExecutionEnabled,
  undefined,
  {
    ...(config.metaAdsApprovedAdAccountId ? { approvedAdAccountId: config.metaAdsApprovedAdAccountId } : {}),
    sandboxAdAccountIds: config.metaAdsSandboxAdAccountIds,
  },
);
const externalActionProviders = new ExternalActionProviderRegistry({
  GOOGLE_ADS: {
    gateway: googleAdsGateway,
    capabilities: { actionTypes: GOOGLE_ADS_MUTATION_TYPES, budgetUnit: 'MAJOR' },
  },
  META_ADS: {
    gateway: metaAdsGateway,
    capabilities: { actionTypes: META_ADS_MUTATION_TYPES, budgetUnit: 'MINOR' },
  },
});
const authProviderFactory=():AuthProvider=>createApiAuthProvider(config);
@Module({
  controllers:[AppController,RegistryController,WorkflowController,ApprovalController,MarketingOsController,ProductSurfaceController,ExternalActionsController,UnifiedCampaignsController,PerformanceOptimizationController,CustomerAcquisitionRevenueController,CustomerEngagementController,ExternalActionPoliciesController,ExternalActionOperationsController],
  providers:[
    AppService,
    RegistryService,
    {
      provide: REGISTRY_SERVICE,
      useExisting: RegistryService,
    },
    ApprovalApiService,ProductSurfaceService,WorkflowApiService,
    {provide:WORKFLOW_RUNTIME_SELECTION,useValue:workflowRuntime},
    {provide:API_TENANT_DATABASE,useValue:tenantDatabase},
    {provide:DURABLE_APPROVAL_REPOSITORY,useValue:durableApprovals},
    {
      provide: ExternalActionApplicationService,
      useFactory: (approvals: ApprovalApiService, databaseFacade: typeof tenantDatabase) =>
        new ExternalActionApplicationService(
          databaseFacade,
          externalActionProviders,
          approvals,
        ),
      inject: [ApprovalApiService, API_TENANT_DATABASE],
    },
    {
      provide: EXTERNAL_ACTION_APPLICATION_SERVICE,
      useExisting: ExternalActionApplicationService,
    },
    {
      provide: UnifiedCampaignApplicationService,
      useFactory: (databaseFacade: typeof tenantDatabase, actions: ExternalActionApplicationService<any>) =>
        new UnifiedCampaignApplicationService(
          databaseFacade,
          actions,
          externalActionProviders,
          workflowRuntime,
        ),
      inject: [API_TENANT_DATABASE, ExternalActionApplicationService],
    },
    {
      provide: UNIFIED_CAMPAIGN_APPLICATION_SERVICE,
      useExisting: UnifiedCampaignApplicationService,
    },
    {
      provide: PerformanceOptimizationApplicationService,
      useFactory: (
        databaseFacade: typeof tenantDatabase,
        campaigns: UnifiedCampaignApplicationService<any>,
        actions: ExternalActionApplicationService<any>,
      ) => new PerformanceOptimizationApplicationService(
        databaseFacade,
        campaigns,
        actions,
        externalActionProviders,
      ),
      inject: [API_TENANT_DATABASE, UnifiedCampaignApplicationService, ExternalActionApplicationService],
    },
    {
      provide: PERFORMANCE_OPTIMIZATION_APPLICATION_SERVICE,
      useExisting: PerformanceOptimizationApplicationService,
    },
    {
      provide: CustomerAcquisitionRevenueApplicationService,
      useFactory: (databaseFacade: typeof tenantDatabase) =>
        new CustomerAcquisitionRevenueApplicationService(databaseFacade),
      inject: [API_TENANT_DATABASE],
    },
    {
      provide: CUSTOMER_ACQUISITION_REVENUE_APPLICATION_SERVICE,
      useExisting: CustomerAcquisitionRevenueApplicationService,
    },
    {
      provide: CustomerEngagementApplicationService,
      useFactory: (databaseFacade: typeof tenantDatabase) =>
        new CustomerEngagementApplicationService(databaseFacade),
      inject: [API_TENANT_DATABASE],
    },
    {
      provide: CUSTOMER_ENGAGEMENT_APPLICATION_SERVICE,
      useExisting: CustomerEngagementApplicationService,
    },
    {
      provide: ExternalActionOperationsApplicationService,
      useFactory: (databaseFacade: typeof tenantDatabase) =>
        new ExternalActionOperationsApplicationService(databaseFacade),
      inject: [API_TENANT_DATABASE],
    },
    {
      provide: EXTERNAL_ACTION_OPERATIONS_APPLICATION_SERVICE,
      useExisting: ExternalActionOperationsApplicationService,
    },
    {
      provide: MarketingOsApplicationService,
      useFactory: (approvals: ApprovalApiService, databaseFacade: typeof tenantDatabase) =>
        createMarketingOsApplicationService({
          config,
          tenantDatabase: databaseFacade,
          workflow: workflowRuntime,
          approvals,
        }),
      inject: [ApprovalApiService, API_TENANT_DATABASE],
    },
    {provide:AUTH_PROVIDER,useFactory:authProviderFactory},
    {provide:ApiAuthGuard,useFactory(provider:AuthProvider){return new ApiAuthGuard(provider);},inject:[AUTH_PROVIDER]}
  ]
})
class AppModule {}
const app=await NestFactory.create(AppModule);
const swagger=new DocumentBuilder().setTitle('AI Marketing OS API').setVersion('1.0').build();
SwaggerModule.setup('openapi',app,SwaggerModule.createDocument(app,swagger));
await app.listen(config.apiPort);
