import 'reflect-metadata';
import { Controller, Get, Headers, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@platform/config';
import { createDb } from '@platform/db';
import { createWorkflowRuntime } from '@platform/workflow-runtime';
import { createLocaleContext, supportedLocales, type Locale } from '@platform/i18n';
import { OidcAuthProvider } from '@platform/auth/oidc';
import { AuthenticationError, type AuthProvider } from '@platform/auth';
import type { TenantContext } from '@platform/contracts';
import { RegistryController, RegistryService } from './registry.controller.js';
import { WorkflowApiService, WorkflowController } from './workflow.controller.js';
import { MarketingOsController } from './marketing-os.controller.js';
import { ApprovalApiService, ApprovalController } from './approval.controller.js';
import { AUTH_PROVIDER, ApiAuthGuard } from './auth.guard.js';
import { ApiTenantDatabase } from './tenant-database.js';
import { ProductSurfaceController, ProductSurfaceService } from './product-surface.controller.js';

export const API_TENANT_DATABASE = Symbol('API_TENANT_DATABASE');

class RejectingAuthProvider implements AuthProvider {
  async verifyAccessToken(_token:string):Promise<TenantContext>{ throw new AuthenticationError('OIDC authentication is not configured'); }
}
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
// This factory only creates a client; a connection is opened by an actual query.
// Tenant-bound persistence code receives the scoped transaction through the
// API_TENANT_DATABASE façade instead of using this client directly.
const database = createDb(config.databaseUrl);
const tenantDatabase = new ApiTenantDatabase(database);
const authProviderFactory=():AuthProvider=>{
  if(config.oidcIssuerUrl&&config.oidcAudience)return new OidcAuthProvider({issuerUrl:config.oidcIssuerUrl,audience:config.oidcAudience});
  return new RejectingAuthProvider();
};
@Module({
  controllers:[AppController,RegistryController,WorkflowController,ApprovalController,MarketingOsController,ProductSurfaceController],
  providers:[
    AppService,RegistryService,WorkflowApiService,ApprovalApiService,ProductSurfaceService,
    {provide:API_TENANT_DATABASE,useValue:tenantDatabase},
    {provide:AUTH_PROVIDER,useFactory:authProviderFactory},
    {provide:ApiAuthGuard,useFactory(provider:AuthProvider){return new ApiAuthGuard(provider);},inject:[AUTH_PROVIDER]}
  ]
})
class AppModule {}
const app=await NestFactory.create(AppModule);
// Temporal mode is deliberately fail-closed until the deployment injects both
// the Temporal command adapter and its durable read model.
const workflowRuntime = createWorkflowRuntime({
  mode: config.workflowRuntimeMode,
});
app.get(WorkflowApiService).configureRuntime(workflowRuntime);
const swagger=new DocumentBuilder().setTitle('AI Marketing OS API').setVersion('1.0').build();
SwaggerModule.setup('openapi',app,SwaggerModule.createDocument(app,swagger));
await app.listen(config.apiPort);
