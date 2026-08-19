export type NodeEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  apiPort: number;
  webUrl: string;
  databaseUrl: string;
  temporalAddress: string;
  temporalNamespace: string;
  artifactBucket: string;
  artifactEndpoint?: string;
  aiProvider: string;
  aiModel: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development') as NodeEnvironment;
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV');
  const apiPort = Number(env.API_PORT ?? 4000);
  if (!Number.isInteger(apiPort) || apiPort < 1)
    throw new Error('API_PORT must be a positive integer');
  return {
    nodeEnv,
    apiPort,
    webUrl: required('WEB_URL', env.WEB_URL),
    databaseUrl: required('DATABASE_URL', env.DATABASE_URL),
    temporalAddress: required('TEMPORAL_ADDRESS', env.TEMPORAL_ADDRESS),
    temporalNamespace: required('TEMPORAL_NAMESPACE', env.TEMPORAL_NAMESPACE),
    artifactBucket: required('ARTIFACT_BUCKET', env.ARTIFACT_BUCKET),
    ...(env.ARTIFACT_ENDPOINT ? { artifactEndpoint: env.ARTIFACT_ENDPOINT } : {}),
    aiProvider: required('AI_PROVIDER', env.AI_PROVIDER),
    aiModel: required('AI_MODEL', env.AI_MODEL),
  };
}
