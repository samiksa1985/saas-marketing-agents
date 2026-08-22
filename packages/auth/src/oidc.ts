import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose';

import type {
  TenantContext,
  Permission,
  Role,
  Locale,
} from '@platform/contracts';

import {
  AuthenticationError,
  type AuthProvider,
} from './index.js';

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
}

interface OidcDiscoveryDocument {
  issuer:
    string;

  jwks_uri:
    string;
}

type TokenClaims =
  JWTPayload &
  Record<
    string,
    unknown
  >;

const DEFAULT_ALGORITHMS:
  string[] = [
    'RS256',
    'PS256',
    'ES256',
  ];

const DEFAULT_TENANT_CLAIM =
  'tenant_id';

const DEFAULT_ROLE_CLAIM =
  'roles';

const DEFAULT_PERMISSION_CLAIM =
  'permissions';

const DEFAULT_LOCALE_CLAIM =
  'locale';

const DEFAULT_LOCALE:
  Locale =
  'en';

function stringClaim(
  claims:
    TokenClaims,
  claim:
    string,
):
  string | undefined {
  const value =
    claims[claim];

  if (
    typeof value !==
      'string'
  ) {
    return undefined;
  }

  const normalized =
    value.trim();

  return normalized
    ? normalized
    : undefined;
}

function stringArrayClaim(
  claims:
    TokenClaims,
  claim:
    string,
): string[] {
  const value =
    claims[claim];

  if (
    Array.isArray(
      value,
    )
  ) {
    return value
      .filter(
        (
          item,
        ): item is string =>
          typeof item ===
            'string' &&
          item.trim()
            .length > 0,
      )
      .map(
        (
          item,
        ) =>
          item.trim(),
      );
  }

  if (
    typeof value ===
      'string' &&
    value.trim()
      .length > 0
  ) {
    return value
      .split(
        /[\s,]+/,
      )
      .map(
        (
          item,
        ) =>
          item.trim(),
      )
      .filter(
        Boolean,
      );
  }

  return [];
}

function localeFromClaim(
  value:
    | string
    | undefined,
  fallback:
    Locale,
): Locale {
  switch (
    value
  ) {
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

function normalizeRoles(
  values:
    string[],
): Role[] {
  const supported =
    new Set<Role>([
      'tenant_admin',
      'engagement_owner',
      'workstream_operator',
      'reviewer',
      'sales_operator',
      'finance_operator',
      'auditor',
    ]);

  return values.filter(
    (
      value,
    ): value is Role =>
      supported.has(
        value as Role,
      ),
  );
}

function normalizePermissions(
  values:
    string[],
): Permission[] {
  const supported =
    new Set<Permission>([
      'tenant:read',
      'tenant:manage',
      'workflow:read',
      'workflow:execute',
      'artifact:read',
      'artifact:write',
      'approval:decide',
      'audit:read',
    ]);

  return values.filter(
    (
      value,
    ): value is Permission =>
      supported.has(
        value as Permission,
      ),
  );
}

export class OidcAuthProvider
  implements AuthProvider {
  private readonly issuerUrl:
    string;

  private readonly audience:
    string;

  private readonly timeoutMs:
    number;

  private readonly algorithms:
    string[];

  private readonly tenantClaim:
    string;

  private readonly roleClaim:
    string;

  private readonly permissionClaim:
    string;

  private readonly localeClaim:
    string;

  private readonly defaultLocale:
    Locale;

  private discoveryPromise:
    Promise<
      OidcDiscoveryDocument
    > |
    undefined;

  private jwks:
    ReturnType<
      typeof createRemoteJWKSet
    > |
    undefined;

  constructor(
    options:
      OidcAuthProviderOptions,
  ) {
    this.issuerUrl =
      options.issuerUrl.replace(
        /\/+$/,
        '',
      );

    this.audience =
      options.audience;

    this.timeoutMs =
      options.timeoutMs ??
      5000;

    this.algorithms =
      [
        ...(
          options.algorithms ??
          DEFAULT_ALGORITHMS
        ),
      ];

    this.tenantClaim =
      options.tenantClaim ??
      DEFAULT_TENANT_CLAIM;

    this.roleClaim =
      options.roleClaim ??
      DEFAULT_ROLE_CLAIM;

    this.permissionClaim =
      options.permissionClaim ??
      DEFAULT_PERMISSION_CLAIM;

    this.localeClaim =
      options.localeClaim ??
      DEFAULT_LOCALE_CLAIM;

    this.defaultLocale =
      options.defaultLocale ??
      DEFAULT_LOCALE;

    if (
      !this.issuerUrl
    ) {
      throw new Error(
        'OIDC issuer URL is required',
      );
    }

    if (
      !this.audience
    ) {
      throw new Error(
        'OIDC audience is required',
      );
    }
  }

  async verifyAccessToken(
    token:
      string,
  ): Promise<TenantContext> {
    if (
      !token ||
      !token.trim()
    ) {
      throw new AuthenticationError(
        'Access token is required',
      );
    }

    try {
      const discovery =
        await this.getDiscovery();

      const jwks =
        this.getJwks(
          discovery,
        );

      const verified =
        await jwtVerify<TokenClaims>(
          token,
          jwks,
          {
            issuer:
              this.issuerUrl,

            audience:
              this.audience,

            algorithms:
              this.algorithms,
          },
        );

      return this.contextFromClaims(
        verified.payload,
      );
    } catch (
      error
    ) {
      if (
        error instanceof
        AuthenticationError
      ) {
        throw error;
      }

      throw new AuthenticationError(
        'Invalid or expired access token',
      );
    }
  }

  private async getDiscovery():
    Promise<
      OidcDiscoveryDocument
    > {
    if (
      this.discoveryPromise
    ) {
      return this.discoveryPromise;
    }

    this.discoveryPromise =
      this.loadDiscovery();

    return this.discoveryPromise;
  }

  private async loadDiscovery():
    Promise<
      OidcDiscoveryDocument
    > {
    const discoveryUrl =
      `${this.issuerUrl}/.well-known/openid-configuration`;

    const response =
      await fetch(
        discoveryUrl,
        {
          signal:
            AbortSignal.timeout(
              this.timeoutMs,
            ),

          headers: {
            accept:
              'application/json',
          },
        },
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `OIDC discovery request failed with status ${response.status}`,
      );
    }

    const document =
      await response.json() as
        Partial<
          OidcDiscoveryDocument
        >;

    if (
      typeof document.issuer !==
        'string' ||
      typeof document.jwks_uri !==
        'string'
    ) {
      throw new Error(
        'OIDC discovery document is missing issuer or jwks_uri',
      );
    }

    const normalizedIssuer =
      document.issuer.replace(
        /\/+$/,
        '',
      );

    if (
      normalizedIssuer !==
      this.issuerUrl
    ) {
      throw new Error(
        'OIDC discovery issuer does not match configured issuer',
      );
    }

    return {
      issuer:
        normalizedIssuer,

      jwks_uri:
        document.jwks_uri,
    };
  }

  private getJwks(
    discovery:
      OidcDiscoveryDocument,
  ) {
    if (
      this.jwks
    ) {
      return this.jwks;
    }

    this.jwks =
      createRemoteJWKSet(
        new URL(
          discovery.jwks_uri,
        ),
        {
          timeoutDuration:
            this.timeoutMs,

          cooldownDuration:
            30_000,

          cacheMaxAge:
            10 *
            60 *
            1000,
        },
      );

    return this.jwks;
  }

  private contextFromClaims(
    claims:
      TokenClaims,
  ): TenantContext {
    const userId =
      typeof claims.sub ===
        'string'
        ? claims.sub
        : undefined;

    const tenantId =
      stringClaim(
        claims,
        this.tenantClaim,
      );

    if (
      !tenantId
    ) {
      throw new AuthenticationError(
        'Authenticated token does not contain a tenant identifier',
      );
    }

    if (
      !userId
    ) {
      throw new AuthenticationError(
        'Authenticated token does not contain a subject identifier',
      );
    }

    const roles =
      normalizeRoles(
        stringArrayClaim(
          claims,
          this.roleClaim,
        ),
      );

    const permissions =
      normalizePermissions(
        stringArrayClaim(
          claims,
          this.permissionClaim,
        ),
      );

    const locale =
      localeFromClaim(
        stringClaim(
          claims,
          this.localeClaim,
        ),
        this.defaultLocale,
      );

    return {
      tenantId,

      userId,

      roles,

      permissions,

      locale,
    };
  }
}