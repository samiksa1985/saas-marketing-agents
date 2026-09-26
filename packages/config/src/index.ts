import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export type NodeEnvironment =
  | 'development'
  | 'test'
  | 'production';

export type WorkflowRuntimeMode =
  | 'in-memory'
  | 'temporal';

export type GoogleAdsExecutionMode =
  | 'DISABLED'
  | 'DRY_RUN'
  | 'MOCK'
  | 'REAL';

/** Meta follows the same opt-in execution contract as every governed provider. */
export type MetaAdsExecutionMode = GoogleAdsExecutionMode;

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  apiPort: number;
  webUrl: string;
  releaseVersion: string;
  corsAllowedOrigins: string[];
  trustProxy: boolean;
  apiRateLimitWindowMs: number;
  apiRateLimitMax: number;
  databaseUrl: string;
  temporalAddress: string;
  temporalNamespace: string;
  workflowRuntimeMode: WorkflowRuntimeMode;
  googleAdsExecutionMode: GoogleAdsExecutionMode;
  googleAdsExecutionEnabled: boolean;
  googleAdsApiVersion: string;
  googleAdsApprovedCustomerId?: string;
  googleAdsSandboxCustomerIds: string[];
  metaAdsExecutionMode: MetaAdsExecutionMode;
  metaAdsExecutionEnabled: boolean;
  metaAdsApiVersion: string;
  metaAdsApprovedAdAccountId?: string;
  metaAdsSandboxAdAccountIds: string[];
  artifactBucket: string;
  artifactEndpoint?: string;
  aiProvider: string;
  aiModel: string;
  oidcIssuerUrl?: string;
  oidcAudience?: string;
  localAcceptanceAuthEnabled: boolean;
  /**
   * Explicit local-only switch used to rehearse durable approval recovery
   * without pretending an unavailable Temporal adapter is configured.
   */
  localAcceptanceDurableApprovals: boolean;
  localAcceptanceAuthTokenFile?: string;
  localAcceptanceAuthTenantId?: string;
  localAcceptanceAuthUserId?: string;
}

function required(
  name: string,
  value: string | undefined,
): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

function optional(
  value: string | undefined,
): string | undefined {
  if (
    value === undefined ||
    value.trim().length === 0
  ) {
    return undefined;
  }

  return value.trim();
}

function optionalBoolean(name: string, value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function positiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function httpsOrigin(name: string, value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an absolute HTTPS origin`); }
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an absolute HTTPS origin without a path`);
  }
  return parsed.origin;
}

function corsOrigins(value: string | undefined, production: boolean): string[] {
  const raw = optional(value);
  if (!raw) {
    if (production) throw new Error('Missing required environment variable: CORS_ALLOWED_ORIGINS');
    return [];
  }
  return [...new Set(raw.split(',').map((origin) => httpsOrigin('CORS_ALLOWED_ORIGINS', origin.trim())))];
}

function googleAdsCustomerId(name: string, value: string | undefined): string | undefined {
  const normalized = optional(value)?.replace(/-/g, '');
  if (normalized !== undefined && !/^\d{1,20}$/.test(normalized)) {
    throw new Error(`${name} must contain only a Google Ads numeric customer ID`);
  }
  return normalized;
}

function googleAdsCustomerIdList(name: string, value: string | undefined): string[] {
  if (!optional(value)) return [];
  return [...new Set(value!.split(',').map((entry) => googleAdsCustomerId(name, entry.trim())).filter((entry): entry is string => entry !== undefined))];
}

/** Meta Graph accepts the `act_` resource prefix; normalize it at the config boundary. */
function metaAdsAccountId(name: string, value: string | undefined): string | undefined {
  const raw = optional(value);
  if (!raw) return undefined;
  const digits = raw.replace(/^act_/i, '');
  if (!/^\d{1,20}$/.test(digits)) {
    throw new Error(`${name} must contain a Meta ad account ID such as act_123456789`);
  }
  return `act_${digits}`;
}

function metaAdsAccountIdList(name: string, value: string | undefined): string[] {
  if (!optional(value)) return [];
  return [...new Set(value!.split(',')
    .map((entry) => metaAdsAccountId(name, entry.trim()))
    .filter((entry): entry is string => entry !== undefined))];
}

function validateLocalAcceptanceTokenFile(tokenFile: string): void {
  if (!isAbsolute(tokenFile)) {
    throw new Error('LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE must be an absolute path outside the repository');
  }
  const workingDirectory = resolve(process.cwd());
  const relativePath = relative(workingDirectory, resolve(tokenFile));
  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
    throw new Error('LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE must be outside the repository');
  }
  try {
    if (readFileSync(tokenFile, 'utf8').trim().length < 32) {
      throw new Error('LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE_TOO_SHORT');
    }
  } catch {
    throw new Error('LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE must reference a readable non-empty high-entropy token file');
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const nodeEnv =
    (env.NODE_ENV ??
      'development') as NodeEnvironment;

  if (
    ![
      'development',
      'test',
      'production',
    ].includes(nodeEnv)
  ) {
    throw new Error(
      'Invalid NODE_ENV',
    );
  }

  const apiPort = Number(
    env.API_PORT ?? 4000,
  );

  if (
    !Number.isInteger(apiPort) ||
    apiPort < 1
  ) {
    throw new Error(
      'API_PORT must be a positive integer',
    );
  }

  const releaseVersion = optional(env.RELEASE_VERSION) ?? 'development';
  if (nodeEnv === 'production' && !/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(releaseVersion)) {
    throw new Error('RELEASE_VERSION must be a semantic version in production');
  }
  const corsAllowedOrigins = corsOrigins(env.CORS_ALLOWED_ORIGINS, nodeEnv === 'production');
  if (nodeEnv === 'production' && env.TRUST_PROXY === undefined) {
    throw new Error('Missing required environment variable: TRUST_PROXY');
  }
  const trustProxy = optionalBoolean('TRUST_PROXY', env.TRUST_PROXY);
  const apiRateLimitWindowMs = positiveInteger('API_RATE_LIMIT_WINDOW_MS', env.API_RATE_LIMIT_WINDOW_MS, 60_000);
  const apiRateLimitMax = positiveInteger('API_RATE_LIMIT_MAX', env.API_RATE_LIMIT_MAX, 300);

  const oidcIssuerUrl =
    optional(
      env.OIDC_ISSUER_URL,
    );

  const oidcAudience =
    optional(
      env.OIDC_AUDIENCE,
    );

  if (nodeEnv === 'production') {
    httpsOrigin('WEB_URL', required('WEB_URL', env.WEB_URL));
    if (!oidcIssuerUrl) {
      throw new Error(
        'Missing required environment variable: OIDC_ISSUER_URL',
      );
    }

    if (!oidcAudience) {
      throw new Error(
        'Missing required environment variable: OIDC_AUDIENCE',
      );
    }
  }

  const workflowRuntimeMode =
    (env.WORKFLOW_RUNTIME_MODE ??
      (nodeEnv === 'production'
        ? 'temporal'
        : 'in-memory')) as WorkflowRuntimeMode;

  if (
    ![
      'in-memory',
      'temporal',
    ].includes(workflowRuntimeMode)
  ) {
    throw new Error(
      'WORKFLOW_RUNTIME_MODE must be in-memory or temporal',
    );
  }

  const localAcceptanceAuthEnabled = optionalBoolean(
    'LOCAL_ACCEPTANCE_AUTH_ENABLED',
    env.LOCAL_ACCEPTANCE_AUTH_ENABLED,
  );
  const localAcceptanceDurableApprovals = optionalBoolean(
    'LOCAL_ACCEPTANCE_DURABLE_APPROVALS',
    env.LOCAL_ACCEPTANCE_DURABLE_APPROVALS,
  );
  if (nodeEnv === 'production' && localAcceptanceAuthEnabled) {
    throw new Error('LOCAL_ACCEPTANCE_AUTH_ENABLED is forbidden in production');
  }
  if (localAcceptanceDurableApprovals && !localAcceptanceAuthEnabled) {
    throw new Error('LOCAL_ACCEPTANCE_DURABLE_APPROVALS requires LOCAL_ACCEPTANCE_AUTH_ENABLED');
  }
  const localAcceptanceAuthTokenFile = optional(env.LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE);
  const localAcceptanceAuthTenantId = optional(env.LOCAL_ACCEPTANCE_AUTH_TENANT_ID);
  const localAcceptanceAuthUserId = optional(env.LOCAL_ACCEPTANCE_AUTH_USER_ID);
  if (localAcceptanceAuthEnabled) {
    if (!localAcceptanceAuthTokenFile) {
      throw new Error('LOCAL_ACCEPTANCE_AUTH_ENABLED requires LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE');
    }
    if (!localAcceptanceAuthTenantId) {
      throw new Error('LOCAL_ACCEPTANCE_AUTH_ENABLED requires LOCAL_ACCEPTANCE_AUTH_TENANT_ID');
    }
    if (!localAcceptanceAuthUserId) {
      throw new Error('LOCAL_ACCEPTANCE_AUTH_ENABLED requires LOCAL_ACCEPTANCE_AUTH_USER_ID');
    }
    validateLocalAcceptanceTokenFile(localAcceptanceAuthTokenFile);
  }

  if (
    nodeEnv === 'production' &&
    workflowRuntimeMode !== 'temporal'
  ) {
    throw new Error(
      'Production requires WORKFLOW_RUNTIME_MODE=temporal',
    );
  }

  const googleAdsExecutionMode =
    (env.GOOGLE_ADS_EXECUTION_MODE ?? 'DISABLED') as GoogleAdsExecutionMode;
  if (!['DISABLED', 'DRY_RUN', 'MOCK', 'REAL'].includes(googleAdsExecutionMode)) {
    throw new Error('GOOGLE_ADS_EXECUTION_MODE must be DISABLED, DRY_RUN, MOCK, or REAL');
  }
  const googleAdsExecutionEnabled = optionalBoolean(
    'GOOGLE_ADS_EXECUTION_ENABLED',
    env.GOOGLE_ADS_EXECUTION_ENABLED,
  );
  if (nodeEnv === 'production' && googleAdsExecutionMode === 'MOCK') {
    throw new Error('Production cannot use GOOGLE_ADS_EXECUTION_MODE=MOCK');
  }
  const googleAdsApiVersion = optional(env.GOOGLE_ADS_API_VERSION) ?? 'v25';
  if (!/^v\d+$/.test(googleAdsApiVersion)) {
    throw new Error('GOOGLE_ADS_API_VERSION must be a version such as v25');
  }
  const googleAdsApprovedCustomerId = googleAdsCustomerId('GOOGLE_ADS_CUSTOMER_ID', env.GOOGLE_ADS_CUSTOMER_ID);
  const googleAdsSandboxCustomerIds = googleAdsCustomerIdList(
    'GOOGLE_ADS_SANDBOX_CUSTOMER_IDS',
    env.GOOGLE_ADS_SANDBOX_CUSTOMER_IDS,
  );
  if (googleAdsExecutionMode === 'REAL') {
    if (!googleAdsApprovedCustomerId) {
      throw new Error('GOOGLE_ADS_EXECUTION_MODE=REAL requires GOOGLE_ADS_CUSTOMER_ID');
    }
    if (googleAdsSandboxCustomerIds.length === 0) {
      throw new Error('GOOGLE_ADS_EXECUTION_MODE=REAL requires GOOGLE_ADS_SANDBOX_CUSTOMER_IDS');
    }
    if (!googleAdsSandboxCustomerIds.includes(googleAdsApprovedCustomerId)) {
      throw new Error('GOOGLE_ADS_CUSTOMER_ID must be included in GOOGLE_ADS_SANDBOX_CUSTOMER_IDS');
    }
  }

  const metaAdsExecutionMode =
    (env.META_ADS_EXECUTION_MODE ?? 'DISABLED') as MetaAdsExecutionMode;
  if (!['DISABLED', 'DRY_RUN', 'MOCK', 'REAL'].includes(metaAdsExecutionMode)) {
    throw new Error('META_ADS_EXECUTION_MODE must be DISABLED, DRY_RUN, MOCK, or REAL');
  }
  const metaAdsExecutionEnabled = optionalBoolean(
    'META_ADS_EXECUTION_ENABLED',
    env.META_ADS_EXECUTION_ENABLED,
  );
  if (nodeEnv === 'production' && metaAdsExecutionMode === 'MOCK') {
    throw new Error('Production cannot use META_ADS_EXECUTION_MODE=MOCK');
  }
  const metaAdsApiVersion = optional(env.META_ADS_API_VERSION) ?? 'v21.0';
  if (!/^v\d+\.\d+$/.test(metaAdsApiVersion)) {
    throw new Error('META_ADS_API_VERSION must be a version such as v21.0');
  }
  const metaAdsApprovedAdAccountId = metaAdsAccountId(
    'META_ADS_AD_ACCOUNT_ID',
    env.META_ADS_AD_ACCOUNT_ID,
  );
  const metaAdsSandboxAdAccountIds = metaAdsAccountIdList(
    'META_ADS_SANDBOX_AD_ACCOUNT_IDS',
    env.META_ADS_SANDBOX_AD_ACCOUNT_IDS,
  );
  if (metaAdsExecutionMode === 'REAL') {
    if (!metaAdsApprovedAdAccountId) {
      throw new Error('META_ADS_EXECUTION_MODE=REAL requires META_ADS_AD_ACCOUNT_ID');
    }
    if (metaAdsSandboxAdAccountIds.length === 0) {
      throw new Error('META_ADS_EXECUTION_MODE=REAL requires META_ADS_SANDBOX_AD_ACCOUNT_IDS');
    }
    if (!metaAdsSandboxAdAccountIds.includes(metaAdsApprovedAdAccountId)) {
      throw new Error('META_ADS_AD_ACCOUNT_ID must be included in META_ADS_SANDBOX_AD_ACCOUNT_IDS');
    }
  }

  return {
    nodeEnv,

    apiPort,

    releaseVersion,

    corsAllowedOrigins,

    trustProxy,

    apiRateLimitWindowMs,

    apiRateLimitMax,

    webUrl: required(
      'WEB_URL',
      env.WEB_URL,
    ),

    databaseUrl: required(
      'DATABASE_URL',
      env.DATABASE_URL,
    ),

    temporalAddress: required(
      'TEMPORAL_ADDRESS',
      env.TEMPORAL_ADDRESS,
    ),

    temporalNamespace: required(
      'TEMPORAL_NAMESPACE',
      env.TEMPORAL_NAMESPACE,
    ),

    workflowRuntimeMode,

    googleAdsExecutionMode,

    googleAdsExecutionEnabled,

    googleAdsApiVersion,

    ...(googleAdsApprovedCustomerId ? { googleAdsApprovedCustomerId } : {}),

    googleAdsSandboxCustomerIds,

    metaAdsExecutionMode,

    metaAdsExecutionEnabled,

    metaAdsApiVersion,

    ...(metaAdsApprovedAdAccountId ? { metaAdsApprovedAdAccountId } : {}),

    metaAdsSandboxAdAccountIds,

    artifactBucket: required(
      'ARTIFACT_BUCKET',
      env.ARTIFACT_BUCKET,
    ),

    ...(env.ARTIFACT_ENDPOINT
      ? {
          artifactEndpoint:
            env.ARTIFACT_ENDPOINT,
        }
      : {}),

    aiProvider: required(
      'AI_PROVIDER',
      env.AI_PROVIDER,
    ),

    aiModel: required(
      'AI_MODEL',
      env.AI_MODEL,
    ),

    ...(oidcIssuerUrl
      ? {
          oidcIssuerUrl,
        }
      : {}),

    ...(oidcAudience
      ? {
          oidcAudience,
        }
      : {}),

    localAcceptanceAuthEnabled,

    localAcceptanceDurableApprovals,

    ...(localAcceptanceAuthEnabled
      ? {
          localAcceptanceAuthTokenFile: localAcceptanceAuthTokenFile!,
          localAcceptanceAuthTenantId: localAcceptanceAuthTenantId!,
          localAcceptanceAuthUserId: localAcceptanceAuthUserId!,
        }
      : {}),
  };
}
