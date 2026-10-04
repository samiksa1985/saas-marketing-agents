import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { TenantContext, Permission, Role, Locale } from '@platform/contracts';

import { CANONICAL_PERMISSIONS, CANONICAL_ROLES } from '@platform/contracts';

import { AuthenticationError, type AuthProvider } from './index.js';

export interface OidcAuthProviderOptions {
  issuerUrl: string;

  audience: string;

  timeoutMs?: number;

  algorithms?: string[];

  tenantClaim?: string;

  roleClaim?: string;

  permissionClaim?: string;

  localeClaim?: string;

  defaultLocale?: Locale;

  expectedNonce?: string;

  discoveryRetryDelayMs?: number;

  requireHttpsEndpoints?: boolean;
}

interface OidcDiscoveryDocument {
  issuer: string;

  jwks_uri: string;

  authorization_endpoint?: string;

  token_endpoint?: string;
}

type TokenClaims = JWTPayload & Record<string, unknown>;

const DEFAULT_ALGORITHMS: string[] = ['RS256', 'PS256', 'ES256'];

const DEFAULT_TENANT_CLAIM = 'tenant_id';

const DEFAULT_ROLE_CLAIM = 'roles';

const DEFAULT_PERMISSION_CLAIM = 'permissions';

const DEFAULT_LOCALE_CLAIM = 'locale';

const DEFAULT_LOCALE: Locale = 'en';

function stringClaim(claims: TokenClaims, claim: string): string | undefined {
  const value = claims[claim];

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized ? normalized : undefined;
}

function stringArrayClaim(claims: TokenClaims, claim: string): string[] {
  const value = claims[claim];

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function localeFromClaim(value: string | undefined, fallback: Locale): Locale {
  switch (value) {
    case 'ar':
    case 'ar-SA':
      return 'ar-SA';

    case 'en':
    case 'en-US':
      return 'en-US';

    default:
      return fallback;
  }
}

export function normalizeOidcRoles(values: string[]): Role[] {
  const supported = new Set<Role>(CANONICAL_ROLES);

  return values.filter((value): value is Role => supported.has(value as Role));
}

export function normalizeOidcPermissions(values: string[]): Permission[] {
  const supported = new Set<Permission>(CANONICAL_PERMISSIONS);

  return values.filter((value): value is Permission => supported.has(value as Permission));
}

export class OidcAuthProvider implements AuthProvider {
  private readonly issuerUrl: string;

  private readonly audience: string;

  private readonly timeoutMs: number;

  private readonly algorithms: string[];

  private readonly tenantClaim: string;

  private readonly roleClaim: string;

  private readonly permissionClaim: string;

  private readonly localeClaim: string;

  private readonly defaultLocale: Locale;

  private readonly expectedNonce: string | undefined;

  private readonly discoveryRetryDelayMs: number;

  private readonly requireHttpsEndpoints: boolean;

  private discoveryPromise: Promise<OidcDiscoveryDocument> | undefined;

  private discoveryRetryAfter = 0;

  private jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(options: OidcAuthProviderOptions) {
    this.issuerUrl = options.issuerUrl.replace(/\/+$/, '');

    this.audience = options.audience;

    this.timeoutMs = options.timeoutMs ?? 5000;

    this.algorithms = [...(options.algorithms ?? DEFAULT_ALGORITHMS)];

    this.tenantClaim = options.tenantClaim ?? DEFAULT_TENANT_CLAIM;

    this.roleClaim = options.roleClaim ?? DEFAULT_ROLE_CLAIM;

    this.permissionClaim = options.permissionClaim ?? DEFAULT_PERMISSION_CLAIM;

    this.localeClaim = options.localeClaim ?? DEFAULT_LOCALE_CLAIM;

    this.defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE;

    this.expectedNonce = options.expectedNonce;

    this.discoveryRetryDelayMs = options.discoveryRetryDelayMs ?? 1000;

    this.requireHttpsEndpoints = options.requireHttpsEndpoints ?? false;

    if (!this.issuerUrl) {
      throw new Error('OIDC issuer URL is required');
    }

    if (!this.audience) {
      throw new Error('OIDC audience is required');
    }
  }

  async verifyAccessToken(token: string): Promise<TenantContext> {
    if (!token || !token.trim()) {
      throw new AuthenticationError('Access token is required');
    }

    try {
      const discovery = await this.getDiscovery();

      const jwks = this.getJwks(discovery);

      const verified = await jwtVerify<TokenClaims>(token, jwks, {
        issuer: this.issuerUrl,

        audience: this.audience,

        algorithms: this.algorithms,

        requiredClaims: ['exp'],
      });

      if (this.expectedNonce && verified.payload.nonce !== this.expectedNonce) {
        throw new AuthenticationError('OIDC nonce does not match the authorization request');
      }

      return this.contextFromClaims(verified.payload);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError('Invalid or expired access token');
    }
  }

  async getAuthorizationEndpoints(): Promise<{
    authorizationEndpoint: string;
    tokenEndpoint: string;
  }> {
    const discovery = await this.getDiscovery();
    if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
      throw new AuthenticationError('OIDC provider does not support browser authorization');
    }
    return {
      authorizationEndpoint: discovery.authorization_endpoint,
      tokenEndpoint: discovery.token_endpoint,
    };
  }

  private async getDiscovery(): Promise<OidcDiscoveryDocument> {
    if (this.discoveryPromise) {
      return this.discoveryPromise;
    }

    if (Date.now() < this.discoveryRetryAfter) {
      throw new Error('OIDC discovery retry is temporarily throttled');
    }
    const pending = this.loadDiscovery();
    this.discoveryPromise = pending;
    try {
      return await pending;
    } catch (error) {
      if (this.discoveryPromise === pending) {
        this.discoveryPromise = undefined;
        this.discoveryRetryAfter = Date.now() + this.discoveryRetryDelayMs;
      }
      throw error;
    }
  }

  private async loadDiscovery(): Promise<OidcDiscoveryDocument> {
    const discoveryUrl = `${this.issuerUrl}/.well-known/openid-configuration`;

    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(this.timeoutMs),

      headers: {
        accept: 'application/json',
      },
      redirect: 'error',
    });

    if (!response.ok) {
      throw new Error(`OIDC discovery request failed with status ${response.status}`);
    }

    const document = (await response.json()) as Partial<OidcDiscoveryDocument>;

    if (typeof document.issuer !== 'string' || typeof document.jwks_uri !== 'string') {
      throw new Error('OIDC discovery document is missing issuer or jwks_uri');
    }

    const normalizedIssuer = document.issuer.replace(/\/+$/, '');

    if (normalizedIssuer !== this.issuerUrl) {
      throw new Error('OIDC discovery issuer does not match configured issuer');
    }

    const jwksUri = this.validateEndpoint(document.jwks_uri, 'jwks_uri');
    const authorizationEndpoint = document.authorization_endpoint === undefined
      ? undefined
      : this.validateEndpoint(document.authorization_endpoint, 'authorization_endpoint');
    const tokenEndpoint = document.token_endpoint === undefined
      ? undefined
      : this.validateEndpoint(document.token_endpoint, 'token_endpoint');

    return {
      issuer: normalizedIssuer,

      jwks_uri: jwksUri,

      ...(authorizationEndpoint ? { authorization_endpoint: authorizationEndpoint } : {}),

      ...(tokenEndpoint ? { token_endpoint: tokenEndpoint } : {}),
    };
  }

  private validateEndpoint(value: string, claim: string): string {
    let endpoint: URL;
    try {
      endpoint = new URL(value);
    } catch {
      throw new Error(`OIDC discovery ${claim} is not an absolute URL`);
    }
    if (
      !['https:', 'http:'].includes(endpoint.protocol) ||
      (this.requireHttpsEndpoints && endpoint.protocol !== 'https:') ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    ) {
      throw new Error(`OIDC discovery ${claim} is not a permitted endpoint`);
    }
    return endpoint.toString();
  }

  private getJwks(discovery: OidcDiscoveryDocument) {
    if (this.jwks) {
      return this.jwks;
    }

    this.jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), {
      timeoutDuration: this.timeoutMs,

      cooldownDuration: 30_000,

      cacheMaxAge: 10 * 60 * 1000,
    });

    return this.jwks;
  }

  private contextFromClaims(claims: TokenClaims): TenantContext {
    const userId = typeof claims.sub === 'string' ? claims.sub : undefined;

    const tenantId = stringClaim(claims, this.tenantClaim);

    if (!tenantId) {
      throw new AuthenticationError('Authenticated token does not contain a tenant identifier');
    }

    if (!userId) {
      throw new AuthenticationError('Authenticated token does not contain a subject identifier');
    }

    const roles = normalizeOidcRoles(stringArrayClaim(claims, this.roleClaim));

    const permissions = normalizeOidcPermissions(stringArrayClaim(claims, this.permissionClaim));

    const locale = localeFromClaim(stringClaim(claims, this.localeClaim), this.defaultLocale);

    return {
      tenantId,

      userId,

      roles,

      permissions,

      locale,
    };
  }
}
