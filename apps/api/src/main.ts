import 'reflect-metadata';

import {
  Controller,
  Get,
  Headers,
  Injectable,
  Module,
} from '@nestjs/common';

import {
  NestFactory,
} from '@nestjs/core';

import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import {
  loadConfig,
} from '@platform/config';

import {
  createLocaleContext,
  supportedLocales,
  type Locale,
} from '@platform/i18n';

import {
  OidcAuthProvider,
} from '@platform/auth/oidc';

import {
  AuthenticationError,
  type AuthProvider,
} from '@platform/auth';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  RegistryController,
  RegistryService,
} from './registry.controller.js';

import {
  WorkflowApiService,
  WorkflowController,
} from './workflow.controller.js';

import {
  AUTH_PROVIDER,
  ApiAuthGuard,
} from './auth.guard.js';

class RejectingAuthProvider
  implements AuthProvider {
  async verifyAccessToken(
    _token: string,
  ): Promise<TenantContext> {
    throw new AuthenticationError(
      'OIDC authentication is not configured',
    );
  }
}

@Injectable()
class AppService {
  health() {
    return {
      status:
        'ok',

      service:
        'api',
    };
  }

  readiness() {
    return {
      status:
        'ready',

      database:
        'configured',

      workflow:
        'configured',
    };
  }
}

@Controller()
class AppController {
  constructor(
    private readonly app:
      AppService,
  ) {}

  @Get('/health')
  health() {
    return this.app.health();
  }

  @Get('/ready')
  ready() {
    return this.app.readiness();
  }

  @Get('/i18n/context')
  context(
    @Headers(
      'accept-language',
    )
    language?: string,
  ) {
    const locale =
      (
        supportedLocales.find(
          (item) =>
            language?.includes(
              item,
            ),
        ) ??
        'en'
      ) as Locale;

    return createLocaleContext(
      locale,
    );
  }
}

const config =
  loadConfig();

const authProviderFactory =
  (): AuthProvider => {
    if (
      config.oidcIssuerUrl &&
      config.oidcAudience
    ) {
      return new OidcAuthProvider({
        issuerUrl:
          config.oidcIssuerUrl,

        audience:
          config.oidcAudience,
      });
    }

    return new RejectingAuthProvider();
  };

@Module({
  controllers: [
    AppController,
    RegistryController,
    WorkflowController,
  ],

  providers: [
    AppService,

    RegistryService,

    WorkflowApiService,

    {
      provide:
        AUTH_PROVIDER,

      useFactory:
        authProviderFactory,
    },

    {
      provide:
        ApiAuthGuard,

      useFactory(
        provider:
          AuthProvider,
      ) {
        return new ApiAuthGuard(
          provider,
        );
      },

      inject: [
        AUTH_PROVIDER,
      ],
    },
  ],
})
class AppModule {}

const app =
  await NestFactory.create(
    AppModule,
  );

const swagger =
  new DocumentBuilder()
    .setTitle(
      'AI Customer Acquisition Platform API',
    )
    .setVersion(
      '1.0',
    )
    .build();

SwaggerModule.setup(
  'openapi',
  app,
  SwaggerModule.createDocument(
    app,
    swagger,
  ),
);

await app.listen(
  config.apiPort,
);