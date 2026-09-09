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

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  apiPort: number;
  webUrl: string;
  databaseUrl: string;
  temporalAddress: string;
  temporalNamespace: string;
  workflowRuntimeMode: WorkflowRuntimeMode;
  googleAdsExecutionMode: GoogleAdsExecutionMode;
  googleAdsExecutionEnabled: boolean;
  googleAdsApiVersion: string;
  googleAdsApprovedCustomerId?: string;
  googleAdsSandboxCustomerIds: string[];
  artifactBucket: string;
  artifactEndpoint?: string;
  aiProvider: string;
  aiModel: string;
  oidcIssuerUrl?: string;
  oidcAudience?: string;
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

  const oidcIssuerUrl =
    optional(
      env.OIDC_ISSUER_URL,
    );

  const oidcAudience =
    optional(
      env.OIDC_AUDIENCE,
    );

  if (nodeEnv === 'production') {
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

  return {
    nodeEnv,

    apiPort,

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
  };
}
