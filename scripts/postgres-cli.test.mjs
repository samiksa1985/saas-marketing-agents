import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  inspectPostgresConnection,
  parsePostgresConnection,
  runPostgresTool,
} from './postgres-cli.mjs';

function withTempDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'codecore-pg-cli-test-'));
  try {
    callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function fakeResult(status = 0) {
  return { status, signal: null, error: undefined, stdout: '', stderr: '' };
}

test('PostgreSQL CLI receives separated connection arguments and a private passfile', () => {
  withTempDirectory((tempRoot) => {
    const password = 'argv-canary:with\\escapes';
    const environment = {
      PATH: process.env.PATH,
      DATABASE_URL: `postgresql://runtime_user:${encodeURIComponent(password)}@db.example.test:5444/platform?sslmode=require`,
      GOOGLE_ADS_CLIENT_SECRET: 'provider-environment-canary',
      GITHUB_TOKEN: 'release-environment-canary',
      PGPASSWORD: 'stale-password-canary',
    };
    let invocation;
    let passfilePath;
    let passfileContents;
    const result = runPostgresTool('pg_dump', ['--format=custom', '--file=backup.dump'], {
      environment,
      platform: 'linux',
      tempRoot,
      spawn: (tool, args, options) => {
        invocation = { tool, args, environment: options.env };
        passfilePath = options.env.PGPASSFILE;
        passfileContents = readFileSync(passfilePath, 'utf8');
        if (process.platform !== 'win32') {
          assert.equal(statSync(passfilePath).mode & 0o777, 0o600);
          assert.equal(
            statSync(join(tempRoot, passfilePath.split(/[\\/]/).at(-2))).mode & 0o777,
            0o700,
          );
        }
        return fakeResult();
      },
    });

    test('production PostgreSQL CLI requires verify-full and forwards an external CA file', () => {
      assert.throws(
        () => runPostgresTool('psql', ['-tAc', 'SELECT 1'], {
          environment: {
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://runtime_user@db.example.com/platform?sslmode=require',
          },
          spawn: () => fakeResult(),
        }),
        /DATABASE_URL_SSLMODE_VERIFY_FULL_REQUIRED/,
      );

      let childEnvironment;
      const result = runPostgresTool('psql', ['-tAc', 'SELECT 1'], {
        environment: {
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://runtime_user@db.example.com/platform?sslmode=verify-full',
          DATABASE_SSL_CA_FILE: '/run/secrets/postgres_ca',
        },
        spawn: (_tool, _args, options) => {
          childEnvironment = options.env;
          return fakeResult();
        },
      });
      assert.equal(result.status, 0);
      assert.equal(childEnvironment.PGSSLMODE, 'verify-full');
      assert.equal(childEnvironment.PGSSLROOTCERT, '/run/secrets/postgres_ca');
    });

    assert.equal(result.status, 0);
    assert.equal(invocation.tool, 'pg_dump');
    assert.ok(invocation.args.includes('db.example.test'));
    assert.ok(invocation.args.includes('5444'));
    assert.ok(invocation.args.includes('runtime_user'));
    assert.ok(invocation.args.includes('platform'));
    assert.ok(invocation.args.includes('--no-password'));
    assert.ok(!JSON.stringify(invocation.args).includes(password));
    assert.ok(!JSON.stringify(invocation.args).includes(encodeURIComponent(password)));
    assert.ok(passfileContents.includes('db.example.test:5444:platform:runtime_user:'));
    assert.ok(passfileContents.includes('argv-canary\\:with\\\\escapes'));
    assert.equal(invocation.environment.PGSSLMODE, 'require');
    assert.equal(invocation.environment.DATABASE_URL, undefined);
    assert.equal(invocation.environment.DATABASE_URL_FILE, undefined);
    assert.equal(invocation.environment.GOOGLE_ADS_CLIENT_SECRET, undefined);
    assert.equal(invocation.environment.GITHUB_TOKEN, undefined);
    assert.equal(invocation.environment.PGPASSWORD, undefined);
    assert.equal(existsSync(passfilePath), false);
  });
});

test('Windows passfile creation restricts the temporary directory to the current SID', () => {
  withTempDirectory((tempRoot) => {
    const calls = [];
    let passfilePath;
    runPostgresTool('psql', ['-tAc', 'SELECT 1'], {
      environment: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        DATABASE_URL: 'postgresql://runtime_user:windows-password-canary@db.example.test/platform',
      },
      platform: 'win32',
      tempRoot,
      spawn: (tool, args, options) => {
        calls.push({ tool, args });
        if (tool === 'whoami.exe') {
          return { ...fakeResult(), stdout: '"DOMAIN\\user","S-1-5-21-123-456-789-1001"\r\n' };
        }
        if (tool === 'icacls.exe') return fakeResult();
        passfilePath = options.env.PGPASSFILE;
        assert.ok(readFileSync(passfilePath, 'utf8').includes('windows-password-canary'));
        return fakeResult();
      },
    });
    assert.deepEqual(
      calls.slice(0, 2).map(({ tool }) => tool),
      ['whoami.exe', 'icacls.exe'],
    );
    assert.ok(calls[1].args.includes('*S-1-5-21-123-456-789-1001:(OI)(CI)F'));
    assert.equal(existsSync(passfilePath), false);
  });
});

test('PGPASSFILE is removed after a failing PostgreSQL child process', () => {
  withTempDirectory((tempRoot) => {
    let passfilePath;
    const result = runPostgresTool('pg_restore', ['--exit-on-error', 'restore.dump'], {
      environment: {
        PATH: process.env.PATH,
        ISOLATED_RESTORE_DATABASE_URL:
          'postgresql://restore_user:cleanup-canary@db.example.test/restore_acceptance',
      },
      connectionEnvironment: 'ISOLATED_RESTORE_DATABASE_URL',
      tempRoot,
      platform: 'linux',
      spawn: (_tool, _args, options) => {
        passfilePath = options.env.PGPASSFILE;
        assert.ok(existsSync(passfilePath));
        return fakeResult(17);
      },
    });
    assert.equal(result.status, 17);
    assert.equal(existsSync(passfilePath), false);
  });
});

test('PGPASSFILE is removed when the child-process launcher throws', () => {
  withTempDirectory((tempRoot) => {
    let passfilePath;
    assert.throws(
      () =>
        runPostgresTool('psql', ['-tAc', 'SELECT 1'], {
          environment: {
            PATH: process.env.PATH,
            DATABASE_URL: 'postgresql://runtime_user:exception-canary@db.example.test/platform',
          },
          tempRoot,
          platform: 'linux',
          spawn: (_tool, _args, options) => {
            passfilePath = options.env.PGPASSFILE;
            throw new Error('synthetic spawn failure');
          },
        }),
      /synthetic spawn failure/,
    );
    assert.equal(existsSync(passfilePath), false);
  });
});

test('file-based connection URL overrides a direct URL and is never sent to the child', () => {
  withTempDirectory((tempRoot) => {
    const secret = 'file-url-canary';
    const file = join(tempRoot, 'database-url.txt');
    writeFileSync(file, `postgresql://runtime_user:${secret}@db.example.test/platform\n`, {
      mode: 0o600,
    });
    let invocation;
    runPostgresTool('psql', ['-tAc', 'SELECT 1'], {
      environment: {
        PATH: process.env.PATH,
        DATABASE_URL: 'postgresql://wrong_user:direct-canary@other.example.test/wrong',
        DATABASE_URL_FILE: file,
      },
      tempRoot,
      platform: 'linux',
      spawn: (tool, args, options) => {
        invocation = { tool, args, environment: options.env };
        return fakeResult();
      },
    });
    assert.ok(invocation.args.includes('runtime_user'));
    assert.ok(invocation.args.includes('db.example.test'));
    assert.ok(!JSON.stringify(invocation.args).includes(secret));
    assert.ok(!JSON.stringify(invocation.args).includes('direct-canary'));
    assert.equal(invocation.environment.DATABASE_URL, undefined);
    assert.equal(invocation.environment.DATABASE_URL_FILE, undefined);
  });
});

test('connection inspection returns identity fields only', () => {
  const identity = inspectPostgresConnection('DATABASE_URL', {
    DATABASE_URL:
      'postgresql://inspect_user:inspect-canary@db.example.test:5443/restore_acceptance',
  });

  test('captured psql probe output is returned without widening the child environment', () => {
    const result = runPostgresTool('psql', ['-tAc', 'SELECT 1'], {
      environment: {
        PATH: process.env.PATH,
        DATABASE_URL: 'postgresql://runtime_user:probe-canary@db.example.test/platform',
      },
      platform: 'linux',
      captureOutput: true,
      spawn: (_tool, _args, options) => {
        assert.ok(!Object.hasOwn(options.env, 'DATABASE_URL'));
        return { ...fakeResult(), stdout: '1\n', stderr: '' };
      },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '1\n');
  });
  assert.deepEqual(identity, {
    host: 'db.example.test',
    port: 5443,
    database: 'restore_acceptance',
    username: 'inspect_user',
  });
  assert.ok(!JSON.stringify(identity).includes('inspect-canary'));
});

test('unreadable and empty file-based connection URLs fail without falling back', () => {
  withTempDirectory((tempRoot) => {
    const emptyFile = join(tempRoot, 'empty-url.txt');
    writeFileSync(emptyFile, '\n');
    for (const [file, expectedCode] of [
      [join(tempRoot, 'missing-url.txt'), 'DATABASE_URL_FILE_UNREADABLE'],
      [emptyFile, 'DATABASE_URL_FILE_EMPTY'],
    ]) {
      assert.throws(
        () =>
          runPostgresTool('psql', ['-tAc', 'SELECT 1'], {
            environment: {
              DATABASE_URL:
                'postgresql://fallback_user:fallback_password@fallback.example.test/platform',
              DATABASE_URL_FILE: file,
            },
            tempRoot,
            platform: 'linux',
          }),
        new RegExp(expectedCode),
      );
    }
  });
});

test('unsupported connection overrides and unknown URI parameters fail closed', () => {
  assert.throws(
    () =>
      runPostgresTool('pg_dump', ['--dbname=other'], {
        environment: {
          DATABASE_URL: 'postgresql://user:some-long-secret@db.example.test/platform',
        },
        platform: 'linux',
      }),
    /POSTGRES_CLI_CONNECTION_OVERRIDE_FORBIDDEN/,
  );
  assert.throws(
    () =>
      parsePostgresConnection(
        'postgresql://user:some-long-secret@db.example.test/platform?custom_secret=value',
      ),
    /POSTGRES_CLI_QUERY_PARAMETER_UNSUPPORTED/,
  );
});
