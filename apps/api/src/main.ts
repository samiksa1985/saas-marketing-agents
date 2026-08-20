import 'reflect-metadata';
import { Controller, Get, Headers, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@platform/config';
import { createLocaleContext, supportedLocales, type Locale } from '@platform/i18n';
import { RegistryController, RegistryService } from './registry.controller.js';
import { WorkflowApiService, WorkflowController } from './workflow.controller.js';

@Injectable()
class AppService {
  health() {
    return { status: 'ok', service: 'api' };
  }
  readiness() {
    return { status: 'ready', database: 'configured', workflow: 'configured' };
  }
}
@Controller()
class AppController {
  constructor(private readonly app: AppService) {}
  @Get('/health') health() {
    return this.app.health();
  }
  @Get('/ready') ready() {
    return this.app.readiness();
  }
  @Get('/i18n/context') context(@Headers('accept-language') language?: string) {
    const locale = (supportedLocales.find((item) => language?.includes(item)) ?? 'en') as Locale;
    return createLocaleContext(locale);
  }
}
@Module({
  controllers: [AppController, RegistryController, WorkflowController],
  providers: [AppService, RegistryService, WorkflowApiService],
})
class AppModule {}

const config = loadConfig();
const app = await NestFactory.create(AppModule);
const swagger = new DocumentBuilder()
  .setTitle('AI Customer Acquisition Platform API')
  .setVersion('1.0')
  .build();
SwaggerModule.setup('openapi', app, SwaggerModule.createDocument(app, swagger));
await app.listen(config.apiPort);
