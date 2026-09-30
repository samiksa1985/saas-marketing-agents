import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CONNECTION_ENVIRONMENTS = new Set([
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'ISOLATED_RESTORE_DATABASE_URL',
]);

const LIBPQ_PARAMETERS = new Map([
  ['application_name', 'PGAPPNAME'],
  ['channel_binding', 'PGCHANNELBINDING'],
  ['connect_timeout', 'PGCONNECT_TIMEOUT'],
  ['gssencmode', 'PGGSSENCMODE'],
  ['options', 'PGOPTIONS'],
  ['sslcert', 'PGSSLCERT'],
  ['sslcrl', 'PGSSLCRL'],
  ['sslkey', 'PGSSLKEY'],
  ['sslmode', 'PGSSLMODE'],
  ['sslrootcert', 'PGSSLROOTCERT'],
  ['target_session_attrs', 'PGTARGETSESSIONATTRS'],
]);

function resolveConnectionEnvironment(environment, name) {
  const fileReference = environment[`${name}_FILE`];
  if (fileReference === undefined || fileReference.trim().length === 0) {
    return environment[name];
  }
  let value;
  try {
    value = readFileSync(fileReference, 'utf8');
  } catch {
    throw new Error(`${name}_FILE_UNREADABLE`);
  }
  if (value.endsWith('\r\n')) value = value.slice(0, -2);
  else if (value.endsWith('\n')) value = value.slice(0, -1);
  if (value.trim().length === 0) throw new Error(`${name}_FILE_EMPTY`);
  return value;
}

const BASE_ENVIRONMENT_KEYS =
  process.platform === 'win32'
    ? [
        'APPDATA',
        'COMSPEC',
        'LOCALAPPDATA',
        'PATHEXT',
        'PATH',
        'SystemRoot',
        'TEMP',
        'TMP',
        'USERPROFILE',
        'WINDIR',
      ]
    : ['HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'PATH', 'TMPDIR'];

function decodeComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error('POSTGRES_CLI_URL_INVALID');
  }
}

export function parsePostgresConnection(value, databaseOverride) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('POSTGRES_CLI_URL_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('POSTGRES_CLI_URL_INVALID');
  }

  const database = decodeComponent(url.pathname.replace(/^\/+/, ''));
  if (!database || database.includes('/') || database.includes('\0')) {
    throw new Error('POSTGRES_CLI_DATABASE_INVALID');
  }

  const username = decodeComponent(url.username);
  let password = decodeComponent(url.password);
  const passwordValues = url.searchParams.getAll('password');
  if (passwordValues.length > 1) throw new Error('POSTGRES_CLI_PASSWORD_AMBIGUOUS');
  if (passwordValues.length === 1) {
    if (password && password !== passwordValues[0]) {
      throw new Error('POSTGRES_CLI_PASSWORD_AMBIGUOUS');
    }
    password = passwordValues[0];
    if (!password) throw new Error('POSTGRES_CLI_PASSWORD_EMPTY');
  }

  const libpqEnvironment = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === 'password') continue;
    const variable = LIBPQ_PARAMETERS.get(key.toLowerCase());
    if (!variable || Object.hasOwn(libpqEnvironment, variable)) {
      throw new Error('POSTGRES_CLI_QUERY_PARAMETER_UNSUPPORTED');
    }
    libpqEnvironment[variable] = value;
  }

  if (!username) throw new Error('POSTGRES_CLI_USER_REQUIRED');
  if (/[\r\n\0]/.test(password)) throw new Error('POSTGRES_CLI_PASSWORD_INVALID');
  if (databaseOverride !== undefined && (!databaseOverride || /[\0\r\n]/.test(databaseOverride))) {
    throw new Error('POSTGRES_CLI_DATABASE_INVALID');
  }

  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port || '5432',
    username,
    database,
    databaseArgument: databaseOverride ?? database,
    password,
    libpqEnvironment,
  };
}

function escapePassfileField(value) {
  return value.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
}

function makePassfile(connection, directory) {
  const path = join(directory, 'pgpass.conf');
  const databases = new Set([connection.database, connection.databaseArgument]);
  const lines = [...databases].map((database) =>
    [connection.host, connection.port, database, connection.username, connection.password]
      .map(escapePassfileField)
      .join(':'),
  );
  writeFileSync(path, `${lines.join('\n')}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(path, 0o600);
  return path;
}

function windowsEnvironment(env) {
  return Object.fromEntries(
    BASE_ENVIRONMENT_KEYS.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]),
  );
}

function protectWindowsDirectory(directory, env, spawn) {
  const aclEnvironment = windowsEnvironment(env);
  const identity = spawn('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    windowsHide: true,
    env: aclEnvironment,
  });
  const sid = identity.stdout?.match(/"(S-\d-[0-9-]+)"\s*$/m)?.[1];
  if (identity.status !== 0 || !sid) {
    throw new Error('POSTGRES_PASSFILE_PERMISSION_SETUP_FAILED');
  }
  const secured = spawn(
    'icacls.exe',
    [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`],
    { encoding: 'utf8', windowsHide: true, env: aclEnvironment },
  );
  if (secured.status !== 0) throw new Error('POSTGRES_PASSFILE_PERMISSION_SETUP_FAILED');
}

function createPassfile(connection, options) {
  const directory = mkdtempSync(join(options.tempRoot, 'codecore-pgpass-'));
  try {
    if (options.platform === 'win32') {
      protectWindowsDirectory(directory, options.env, options.spawn);
    } else {
      chmodSync(directory, 0o700);
    }
    const path = makePassfile(connection, directory);
    return { directory, path };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    if (error instanceof Error && error.message === 'POSTGRES_PASSFILE_PERMISSION_SETUP_FAILED') {
      throw error;
    }
    throw new Error('POSTGRES_PASSFILE_CREATE_FAILED');
  }
}

function childEnvironment(source, connection, passfilePath) {
  const safe = Object.fromEntries(
    BASE_ENVIRONMENT_KEYS.filter((key) => source[key] !== undefined).map((key) => [
      key,
      source[key],
    ]),
  );
  for (const name of LIBPQ_PARAMETERS.values()) {
    if (source[name] !== undefined && safe[name] === undefined) safe[name] = source[name];
  }
  if (source.DATABASE_SSL_CA_FILE !== undefined && safe.PGSSLROOTCERT === undefined) {
    safe.PGSSLROOTCERT = source.DATABASE_SSL_CA_FILE;
  }
  for (const [name, value] of Object.entries(connection.libpqEnvironment)) safe[name] = value;
  if (passfilePath) safe.PGPASSFILE = passfilePath;
  else if (source.PGPASSFILE) safe.PGPASSFILE = source.PGPASSFILE;
  return safe;
}

function assertNoPasswordInArguments(args, password) {
  if (!password) return;
  const encoded = encodeURIComponent(password);
  if (
    args.some((argument) => /^postgres(?:ql)?:\/\//i.test(argument)) ||
    args.some((argument) =>
      password.length >= 4
        ? argument.includes(password) || argument.includes(encoded)
        : argument === password || argument === encoded,
    )
  ) {
    throw new Error('POSTGRES_CLI_PASSWORD_IN_ARGUMENTS');
  }
}

export function runPostgresTool(tool, args, options = {}) {
  const environment = options.environment ?? process.env;
  const connectionEnvironment = options.connectionEnvironment ?? 'DATABASE_URL';
  if (!CONNECTION_ENVIRONMENTS.has(connectionEnvironment)) {
    throw new Error('POSTGRES_CLI_CONNECTION_ENVIRONMENT_UNSUPPORTED');
  }
  const connectionUrl = resolveConnectionEnvironment(environment, connectionEnvironment);
  if (!connectionUrl?.trim()) throw new Error(`${connectionEnvironment}_REQUIRED`);
  if (environment.NODE_ENV === 'production') {
    let sslModes;
    try {
      sslModes = new URL(connectionUrl).searchParams.getAll('sslmode');
    } catch {
      throw new Error(`${connectionEnvironment}_URL_INVALID`);
    }
    if (sslModes.length !== 1 || sslModes[0] !== 'verify-full') {
      throw new Error(`${connectionEnvironment}_SSLMODE_VERIFY_FULL_REQUIRED`);
    }
  }
  const connection = parsePostgresConnection(connectionUrl, options.database);
  assertNoPasswordInArguments(args, connection.password);
  if (
    args.some((argument) =>
      /^(?:-h|--host|-p|--port|-U|--username|-d|--dbname|--no-password|--password)(?:=|$)/.test(
        argument,
      ),
    )
  ) {
    throw new Error('POSTGRES_CLI_CONNECTION_OVERRIDE_FORBIDDEN');
  }

  const spawn = options.spawn ?? spawnSync;
  const platform = options.platform ?? process.platform;
  const passfileOptions = {
    env: environment,
    platform,
    spawn,
    tempRoot: options.tempRoot ?? tmpdir(),
  };
  let passfile;
  try {
    if (connection.password) passfile = createPassfile(connection, passfileOptions);
    const childEnv = childEnvironment(environment, connection, passfile?.path);
    const toolArgs = [
      '--host',
      connection.host,
      '--port',
      connection.port,
      '--username',
      connection.username,
      '--dbname',
      connection.databaseArgument,
      '--no-password',
      ...args,
    ];
    const captureOutput = options.captureOutput === true;
    const result = spawn(
      tool,
      toolArgs,
      captureOutput
        ? { env: childEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true }
        : { env: childEnv, stdio: 'inherit', windowsHide: true },
    );
    if (result.error) throw new Error('POSTGRES_CLI_EXECUTION_FAILED');
    return {
      status: result.status ?? 1,
      stdout: captureOutput ? (result.stdout ?? '') : '',
      stderr: captureOutput ? (result.stderr ?? '') : '',
    };
  } finally {
    if (passfile && existsSync(passfile.directory)) {
      rmSync(passfile.directory, { recursive: true, force: true });
    }
  }
}

function parseCli(args) {
  const [action, ...rest] = args;
  if (action !== 'inspect' && action !== 'run') throw new Error('POSTGRES_CLI_ACTION_REQUIRED');
  const options = { action };
  let index = 0;
  while (index < rest.length && rest[index] !== '--') {
    const option = rest[index++];
    if (option === '--capture-output') {
      options.captureOutput = true;
      continue;
    }
    const value = rest[index++];
    if (!value || !['--connection-env', '--tool', '--database'].includes(option)) {
      throw new Error('POSTGRES_CLI_ARGUMENTS_INVALID');
    }
    const key = option.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(options, key)) throw new Error('POSTGRES_CLI_ARGUMENTS_INVALID');
    options[key] = value;
  }
  const toolArgs = rest[index] === '--' ? rest.slice(index + 1) : [];
  if (!options.connectionEnv || (action === 'run' && !options.tool)) {
    throw new Error('POSTGRES_CLI_ARGUMENTS_INVALID');
  }
  return { ...options, toolArgs };
}

export function inspectPostgresConnection(environmentName, environment = process.env) {
  if (!CONNECTION_ENVIRONMENTS.has(environmentName)) {
    throw new Error('POSTGRES_CLI_CONNECTION_ENVIRONMENT_UNSUPPORTED');
  }
  const value = resolveConnectionEnvironment(environment, environmentName);
  if (!value?.trim()) throw new Error(`${environmentName}_REQUIRED`);
  const connection = parsePostgresConnection(value);
  return {
    host: connection.host,
    port: Number(connection.port),
    database: connection.database,
    username: connection.username,
  };
}

async function main() {
  try {
    const cli = parseCli(process.argv.slice(2));
    if (cli.action === 'inspect') {
      process.stdout.write(`${JSON.stringify(inspectPostgresConnection(cli.connectionEnv))}\n`);
      return;
    }
    const result = runPostgresTool(cli.tool, cli.toolArgs, {
      connectionEnvironment: cli.connectionEnv,
      database: cli.database,
      captureOutput: cli.captureOutput,
    });
    if (cli.captureOutput) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    }
    process.exitCode = result.status;
  } catch (error) {
    const message =
      error instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(error.message)
        ? error.message
        : 'POSTGRES_CLI_FAILED';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
