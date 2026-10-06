import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { TenantContext } from '@platform/contracts';
import { authorize } from '@platform/auth';
import {
  GoogleAdsConnectionService,
  type GoogleAdsConnectionRecord,
  type GoogleAdsConnectionStore,
  type GoogleAdsAccountMappingRecord,
  GoogleAdsProviderError,
} from '@platform/tool-gateway';
import { createStructuredLogger, platformMetrics } from '@platform/observability';
import type { RuntimeConfig } from '@platform/config';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { ApiTenantDatabase } from './tenant-database.js';
import { API_TENANT_DATABASE } from './main.js';

const logger = createStructuredLogger('api');
export const GOOGLE_ADS_CONNECTION_SERVICE = Symbol('GOOGLE_ADS_CONNECTION_SERVICE');

type SqlClient = { unsafe(query: string, parameters?: readonly unknown[]): Promise<unknown> };
type Transaction = { execute(query: unknown): Promise<unknown>; $client?: SqlClient };
type TenantRunner = { transaction<T>(operation: (transaction: never) => Promise<T>): Promise<T> };

function rows<T>(result: unknown): T[] {
  return Array.from(result as Iterable<T>);
}

function mapConnection(row: Record<string, unknown>): GoogleAdsConnectionRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    status: String(row.status) as GoogleAdsConnectionRecord['status'],
    ...(row.principal_ref ? { principalRef: String(row.principal_ref) } : {}),
    ...(row.credential_ref ? { credentialRef: String(row.credential_ref) } : {}),
    scopes: Array.isArray(row.scopes) ? (row.scopes as unknown[]).map(String) : [],
    ...(row.connected_at ? { connectedAt: new Date(String(row.connected_at)) } : {}),
    ...(row.verified_at ? { verifiedAt: new Date(String(row.verified_at)) } : {}),
    ...(row.verification_request_id ? { verificationRequestId: String(row.verification_request_id) } : {}),
    ...(row.disconnected_at ? { disconnectedAt: new Date(String(row.disconnected_at)) } : {}),
    idempotencyKey: String(row.idempotency_key),
  };
}

/** Tenant-scoped PostgreSQL connection store; every query runs under RLS. */
export class PostgresGoogleAdsConnectionStore implements GoogleAdsConnectionStore {
  constructor(private readonly database: ApiTenantDatabase<never> & TenantRunner) {}

  private async scoped<T>(context: TenantContext, query: string, parameters: readonly unknown[]): Promise<T[]> {
    return this.database.execute(context, async (transaction) => {
      const client = (transaction as unknown as { $client: SqlClient }).$client;
      return rows<T>(await client.unsafe(query, parameters));
    });
  }

  async createPending(context: TenantContext, input: { idempotencyKey: string; oauthStateHash: string; oauthStateExpiresAt: Date }) {
    const existing = await this.scoped<Record<string, unknown>>(
      context,
      `SELECT * FROM google_ads_connections WHERE tenant_id = $1::uuid AND idempotency_key = $2 AND status <> 'DISCONNECTED'`,
      [context.tenantId, input.idempotencyKey],
    );
    if (existing[0]) return mapConnection(existing[0]);
    const inserted = await this.scoped<Record<string, unknown>>(
      context,
      `INSERT INTO google_ads_connections (tenant_id, idempotency_key, oauth_state_hash, oauth_state_expires_at)
       VALUES ($1::uuid, $2, $3, $4) RETURNING *`,
      [context.tenantId, input.idempotencyKey, input.oauthStateHash, input.oauthStateExpiresAt.toISOString()],
    );
    return mapConnection(inserted[0]!);
  }

  async findByStateHash(context: TenantContext, stateHash: string) {
    const found = await this.scoped<Record<string, unknown>>(
      context,
      `SELECT * FROM google_ads_connections
       WHERE tenant_id = $1::uuid AND oauth_state_hash = $2 AND oauth_state_expires_at > now()`,
      [context.tenantId, stateHash],
    );
    return found[0] ? mapConnection(found[0]) : undefined;
  }

  async findById(context: TenantContext, connectionId: string) {
    const found = await this.scoped<Record<string, unknown>>(
      context,
      `SELECT * FROM google_ads_connections WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [context.tenantId, connectionId],
    );
    return found[0] ? mapConnection(found[0]) : undefined;
  }

  async markConnected(context: TenantContext, connectionId: string, input: { principalRef: string; credentialRef: string; scopes: string[] }) {
    const updated = await this.scoped<Record<string, unknown>>(
      context,
      `UPDATE google_ads_connections
       SET status = 'CONNECTED', principal_ref = $3, credential_ref = $4, scopes = $5::text[],
           connected_at = now(), oauth_state_hash = NULL, oauth_state_expires_at = NULL
       WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'PENDING'
       RETURNING *`,
      [context.tenantId, connectionId, input.principalRef, input.credentialRef, input.scopes],
    );
    if (!updated[0]) throw new GoogleAdsProviderError('GOOGLE_ADS_CONNECTION_NOT_FOUND', false, false, 'ACCOUNT_ACCESS');
    return mapConnection(updated[0]);
  }

  async markVerified(context: TenantContext, connectionId: string, verificationRequestId?: string) {
    await this.scoped(
      context,
      `UPDATE google_ads_connections
       SET status = 'VERIFIED', verified_at = now(), verification_request_id = $3
       WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'CONNECTED'`,
      [context.tenantId, connectionId, verificationRequestId ?? null],
    );
  }

  async markFailed(context: TenantContext, connectionId: string) {
    await this.scoped(
      context,
      `UPDATE google_ads_connections SET status = 'FAILED', oauth_state_hash = NULL
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [context.tenantId, connectionId],
    );
  }

  async markDisconnected(context: TenantContext, connectionId: string) {
    const updated = await this.scoped(
      context,
      `UPDATE google_ads_connections
       SET status = 'DISCONNECTED', disconnected_at = now(), credential_ref = NULL
       WHERE tenant_id = $1::uuid AND id = $2::uuid AND status IN ('CONNECTED', 'VERIFIED', 'PENDING', 'FAILED')
       RETURNING id`,
      [context.tenantId, connectionId],
    );
    if (updated.length === 0) throw new GoogleAdsProviderError('GOOGLE_ADS_CONNECTION_NOT_FOUND', false, false, 'ACCOUNT_ACCESS');
  }

  async replaceAccountMappings(context: TenantContext, connectionId: string, mappings: Array<{ customerId: string; loginCustomerId?: string; descriptiveName?: string; currencyCode?: string; isManager: boolean }>) {
    await this.database.execute(context, async (transaction) => {
      const client = (transaction as unknown as { $client: SqlClient }).$client;
      await client.unsafe(
        `DELETE FROM google_ads_account_mappings WHERE tenant_id = $1::uuid AND connection_id = $2::uuid`,
        [context.tenantId, connectionId],
      );
      for (const mapping of mappings) {
        await client.unsafe(
          `INSERT INTO google_ads_account_mappings (tenant_id, connection_id, customer_id, login_customer_id, descriptive_name, currency_code, is_manager)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
          [context.tenantId, connectionId, mapping.customerId, mapping.loginCustomerId ?? null, mapping.descriptiveName ?? null, mapping.currencyCode ?? null, mapping.isManager],
        );
      }
    });
  }

  async listAccountMappings(context: TenantContext, connectionId: string): Promise<GoogleAdsAccountMappingRecord[]> {
    const found = await this.scoped<Record<string, unknown>>(
      context,
      `SELECT * FROM google_ads_account_mappings WHERE tenant_id = $1::uuid AND connection_id = $2::uuid ORDER BY customer_id`,
      [context.tenantId, connectionId],
    );
    return found.map((row) => ({
      id: String(row.id),
      connectionId: String(row.connection_id),
      customerId: String(row.customer_id),
      ...(row.login_customer_id ? { loginCustomerId: String(row.login_customer_id) } : {}),
      ...(row.descriptive_name ? { descriptiveName: String(row.descriptive_name) } : {}),
      ...(row.currency_code ? { currencyCode: String(row.currency_code) } : {}),
      isManager: row.is_manager === true,
      accessible: row.accessible === true,
      selected: row.selected === true,
    }));
  }

  async selectAccount(context: TenantContext, connectionId: string, customerId: string, loginCustomerId?: string) {
    await this.database.execute(context, async (transaction) => {
      const client = (transaction as unknown as { $client: SqlClient }).$client;
      await client.unsafe(
        `UPDATE google_ads_account_mappings SET selected = false WHERE tenant_id = $1::uuid AND connection_id = $2::uuid`,
        [context.tenantId, connectionId],
      );
      const updated = await client.unsafe(
        `UPDATE google_ads_account_mappings SET selected = true, login_customer_id = $4
         WHERE tenant_id = $1::uuid AND connection_id = $2::uuid AND customer_id = $3 AND accessible = true
         RETURNING id`,
        [context.tenantId, connectionId, customerId, loginCustomerId ?? null],
      );
      if (Array.from(updated as Iterable<unknown>).length === 0) {
        throw new GoogleAdsProviderError('GOOGLE_ADS_ACCOUNT_NOT_ACCESSIBLE', false, false, 'ACCOUNT_ACCESS');
      }
    });
  }

  async listConnections(context: TenantContext): Promise<GoogleAdsConnectionRecord[]> {
    const found = await this.scoped<Record<string, unknown>>(
      context,
      `SELECT * FROM google_ads_connections WHERE tenant_id = $1::uuid ORDER BY created_at`,
      [context.tenantId],
    );
    return found.map(mapConnection);
  }
}

interface ConnectBody { idempotencyKey?: string }
interface CallbackBody { state?: string; code?: string }
interface SelectBody { customerId?: string; loginCustomerId?: string }

/**
 * Same-origin Google Ads connection controller. The browser never sees OAuth
 * tokens, client secret, or developer token; the redirect target is Google.
 */
@Controller('/provider-connections/google-ads')
@UseGuards(ApiAuthGuard)
export class GoogleAdsConnectionsController {
  constructor(
    @Optional() @Inject(GOOGLE_ADS_CONNECTION_SERVICE) private readonly service?: GoogleAdsConnectionService,
    @Optional() @Inject('PLATFORM_CONFIG') private readonly config?: RuntimeConfig,
  ) {}

  private requireEnabled(): GoogleAdsConnectionService {
    if (!this.config?.googleAdsConnectionEnabled || !this.service) {
      throw new NotFoundException('Google Ads connection is not enabled');
    }
    return this.service;
  }

  private context(request: unknown): TenantContext {
    return getAuthContext(request as AuthenticatedRequest);
  }

  private requirePermission(context: TenantContext, permission: 'integration:admin' | 'artifact:read'): void {
    try {
      authorize(context, permission);
    } catch {
      platformMetrics.recordSignal('authorization', 'rejected');
      logger.emit('warn', 'security.authorization.rejected', { permission });
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  }

  @Post('/connect')
  async connect(@Req() request: unknown, @Body() body: ConnectBody) {
    const context = this.context(request);
    this.requirePermission(context, 'integration:admin');
    const service = this.requireEnabled();
    const result = await service.startConnection(context, body?.idempotencyKey ?? `gads-connect-${Date.now()}`);
    platformMetrics.recordSignal('provider', 'started');
    logger.emit('info', 'provider.connection_started', { provider: 'GOOGLE_ADS' });
    return { authorizationUrl: result.authorizationUrl, connectionId: result.connectionId };
  }

  @Post('/callback')
  async callback(@Req() request: unknown, @Body() body: CallbackBody) {
    const context = this.context(request);
    this.requirePermission(context, 'integration:admin');
    const service = this.requireEnabled();
    if (!body?.state || !body.code) throw new UnauthorizedException('OAuth callback is invalid');
    try {
      const result = await service.completeConnection(context, {
        state: body.state,
        code: body.code,
        principalRef: context.userId ?? 'unknown',
      });
      platformMetrics.recordSignal('provider', result.verified ? 'verified' : 'accepted');
      logger.emit('info', 'provider.connection_completed', { provider: 'GOOGLE_ADS', verified: result.verified });
      return { connectionId: result.connectionId, verified: result.verified };
    } catch (error) {
      if (error instanceof GoogleAdsProviderError) {
        platformMetrics.recordSignal('provider', 'rejected');
        logger.emit('warn', 'provider.connection_rejected', { provider: 'GOOGLE_ADS', code: error.code });
        throw new UnauthorizedException('Google Ads connection failed');
      }
      throw error;
    }
  }

  @Get()
  async list(@Req() request: unknown) {
    const context = this.context(request);
    this.requirePermission(context, 'artifact:read');
    return this.requireEnabled().listConnections(context);
  }

  @Get('/:connectionId/accounts')
  async accounts(@Req() request: unknown, @Param('connectionId') connectionId: string) {
    const context = this.context(request);
    this.requirePermission(context, 'artifact:read');
    return this.requireEnabled().listAccounts(context, connectionId);
  }

  @Post('/:connectionId/select-account')
  async select(@Req() request: unknown, @Param('connectionId') connectionId: string, @Body() body: SelectBody) {
    const context = this.context(request);
    this.requirePermission(context, 'integration:admin');
    if (!body?.customerId) throw new UnauthorizedException('customerId is required');
    try {
      await this.requireEnabled().selectAccount(context, connectionId, body.customerId, body.loginCustomerId);
      platformMetrics.recordSignal('provider', 'accepted');
      return { status: 'selected' };
    } catch (error) {
      if (error instanceof GoogleAdsProviderError) {
        platformMetrics.recordSignal('provider', 'rejected');
        throw new ForbiddenException('Google Ads account selection failed');
      }
      throw error;
    }
  }

  @Post('/:connectionId/disconnect')
  async disconnect(@Req() request: unknown, @Param('connectionId') connectionId: string) {
    const context = this.context(request);
    this.requirePermission(context, 'integration:admin');
    await this.requireEnabled().disconnect(context, connectionId);
    platformMetrics.recordSignal('provider', 'succeeded');
    logger.emit('info', 'provider.disconnected', { provider: 'GOOGLE_ADS' });
    return { status: 'disconnected' };
  }

  @Get('/status')
  async status(@Req() request: unknown, @Query('connectionId') connectionId?: string) {
    const context = this.context(request);
    this.requirePermission(context, 'artifact:read');
    const service = this.requireEnabled();
    if (!connectionId) return { enabled: true };
    const record = await service.listConnections(context);
    const connection = record.find((item) => item.id === connectionId);
    if (!connection) throw new NotFoundException('Connection not found');
    return { status: connection.status, verifiedAt: connection.verifiedAt };
  }
}
