import {
  Controller,
  Get,
  Headers,
  Header,
  Inject,
  NotFoundException,
  Post,
  Query,
  Body,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticationError } from '@platform/auth';
import { createStructuredLogger, currentRequestId, platformMetrics } from '@platform/observability';
import {
  BrowserAuthService,
  type BrowserLoginStart,
  cookieValue,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  serializeTransactionCookie,
  sessionCookieName,
  transactionCookieName,
} from './browser-auth.service.js';

export const BROWSER_AUTH_SERVICE = 'PLATFORM_BROWSER_AUTH_SERVICE';
const logger = createStructuredLogger('api');

interface ApiResponse {
  setHeader(name: string, value: string): void;
  redirect(status: number, url: string): void;
  status(status: number): ApiResponse;
  json(value: unknown): void;
}

@Controller('/browser-auth')
export class BrowserAuthController {
  constructor(
    @Inject(BROWSER_AUTH_SERVICE)
    private readonly browserAuth: BrowserAuthService,
  ) {}

  @Get('/login')
  async login(
    @Query('returnTo') returnTo: string | undefined,
    @Res() response: ApiResponse,
  ): Promise<void> {
    if (!this.browserAuth.isEnabled()) throw new NotFoundException();
    let result: BrowserLoginStart;
    try {
      result = await this.browserAuth.startLogin(returnTo);
    } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      throw new ServiceUnavailableException('Browser identity provider unavailable');
    }
    response.setHeader(
      'Set-Cookie',
      serializeTransactionCookie(result.bindingCookie, this.browserAuth.productionCookies),
    );
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(302, result.authorizationUrl);
  }

  @Get('/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('iss') authorizationIssuer: string | undefined,
    @Headers('cookie') cookies: string | undefined,
    @Res() response: ApiResponse,
  ): Promise<void> {
    if (!this.browserAuth.isEnabled()) throw new NotFoundException();
    try {
      const result = await this.browserAuth.completeLogin({
        code,
        state,
        error,
        authorizationIssuer,
        binding: cookieValue(
          cookies,
          transactionCookieName(this.browserAuth.productionCookies),
        ),
      });
      response.setHeader(
        'Set-Cookie',
        serializeSessionCookie(result.sessionId, this.browserAuth.productionCookies),
      );
      response.setHeader('Cache-Control', 'no-store');
      response.redirect(303, result.returnTo);
    } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      platformMetrics.recordSignal('authentication', 'rejected');
      logger.emit('warn', 'browser_auth.login_rejected');
      const requestId = currentRequestId();
      const loginError = new URL('/login', 'http://localhost');
      loginError.searchParams.set('error', 'authentication_failed');
      if (requestId) loginError.searchParams.set('requestId', requestId);
      response.setHeader('Cache-Control', 'no-store');
      response.redirect(303, `${loginError.pathname}${loginError.search}`);
    }
  }

  @Get('/session')
  @Header('Cache-Control', 'no-store')
  async session(
    @Headers('cookie') cookies: string | undefined,
  ) {
    if (!this.browserAuth.isEnabled()) throw new NotFoundException();
    const sessionId = cookieValue(cookies, sessionCookieName(this.browserAuth.productionCookies));
    return this.browserAuth.getSession(sessionId);
  }

  @Post('/tenant')
  async selectTenant(
    @Body('tenantId') tenantId: string,
    @Headers('cookie') cookies: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Res() response: ApiResponse,
  ): Promise<void> {
    const sessionId = cookieValue(cookies, sessionCookieName(this.browserAuth.productionCookies));
    if (!sessionId) throw new NotFoundException();
    let newSessionId: string;
    try {
      newSessionId = await this.browserAuth.switchTenant({
        sessionId,
        tenantId,
        origin,
        csrfToken,
      });
    } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      throw new UnauthorizedException(error.message);
    }
    response.setHeader(
      'Set-Cookie',
      serializeSessionCookie(newSessionId, this.browserAuth.productionCookies),
    );
    response.setHeader('Cache-Control', 'no-store');
    response.status(204).json(undefined);
  }

  @Post('/logout')
  async logout(
    @Headers('cookie') cookies: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Res() response: ApiResponse,
  ): Promise<void> {
    const sessionId = cookieValue(cookies, sessionCookieName(this.browserAuth.productionCookies));
    try {
      await this.browserAuth.logout({ sessionId, origin, csrfToken });
    } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      throw new UnauthorizedException(error.message);
    }
    response.setHeader(
      'Set-Cookie',
      serializeClearedSessionCookie(this.browserAuth.productionCookies),
    );
    response.setHeader('Cache-Control', 'no-store');
    response.status(204).json(undefined);
  }
}
