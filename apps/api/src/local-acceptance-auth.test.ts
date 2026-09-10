import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuthenticationError } from '@platform/auth';
import { ExecutionContext } from '@nestjs/common';

import { AUTH_CONTEXT, ApiAuthGuard, type AuthenticatedRequest, getAuthContext } from './auth.guard.js';
import { LocalAcceptanceAuthProvider } from './local-acceptance-auth.js';

function withLocalToken(callback: (tokenFile: string, token: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'nawa-local-acceptance-provider-'));
  const tokenFile = join(directory, 'token.txt');
  const token = randomBytes(48).toString('base64url');
  writeFileSync(tokenFile, token, { encoding: 'utf8' });
  return callback(tokenFile, token).finally(() => rmSync(directory, { recursive: true, force: true }));
}

test('local acceptance provider returns only the fixed canonical acceptance context', async () => {
  await withLocalToken(async (tokenFile, token) => {
    const provider = new LocalAcceptanceAuthProvider({ tokenFile, tenantId: 'tenant-acceptance', userId: 'user-acceptance' });
    const context = await provider.verifyAccessToken(token);
    assert.deepEqual(context, {
      tenantId: 'tenant-acceptance',
      userId: 'user-acceptance',
      roles: ['tenant_admin'],
      permissions: [
        'marketing:admin',
        'workflow:execute',
        'approval:decide',
        'integration:admin',
        'artifact:read',
        'audit:read',
      ],
      locale: 'ar-SA',
    });
    assert.equal(JSON.stringify(context).includes(token), false);
    assert.equal(JSON.stringify(provider).includes(token), false);
  });
});

test('local acceptance provider rejects incorrect bearer tokens without returning token material', async () => {
  await withLocalToken(async (tokenFile, token) => {
    const provider = new LocalAcceptanceAuthProvider({ tokenFile, tenantId: 'tenant-acceptance', userId: 'user-acceptance' });
    const incorrect = randomBytes(48).toString('base64url');
    await assert.rejects(
      () => provider.verifyAccessToken(incorrect),
      (error: unknown) => {
        assert.ok(error instanceof AuthenticationError);
        assert.equal((error as Error).message.includes(token), false);
        assert.equal((error as Error).message.includes(incorrect), false);
        return true;
      },
    );
  });
});

test('local acceptance provider remains bound to its configured tenant and fails closed for an unreadable token file', async () => {
  await withLocalToken(async (tokenFile, token) => {
    const provider = new LocalAcceptanceAuthProvider({ tokenFile, tenantId: 'tenant-fixed', userId: 'user-fixed' });
    assert.equal((await provider.verifyAccessToken(token)).tenantId, 'tenant-fixed');
  });
  assert.throws(
    () => new LocalAcceptanceAuthProvider({ tokenFile: join(tmpdir(), 'missing-local-acceptance-token.txt'), tenantId: 'tenant-a', userId: 'user-a' }),
    /LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE_UNREADABLE/,
  );
});

test('local acceptance identity reaches the existing Bearer guard without accepting a caller-supplied tenant', async () => {
  await withLocalToken(async (tokenFile, token) => {
    const provider = new LocalAcceptanceAuthProvider({ tokenFile, tenantId: 'tenant-fixed', userId: 'user-fixed' });
    const request: AuthenticatedRequest = { headers: { authorization: `Bearer ${token}` } };
    const execution = {
      switchToHttp() {
        return { getRequest<TRequest = AuthenticatedRequest>() { return request as TRequest; } };
      },
    } as unknown as ExecutionContext;
    assert.equal(await new ApiAuthGuard(provider).canActivate(execution), true);
    assert.equal(getAuthContext(request).tenantId, 'tenant-fixed');
    assert.equal(request[AUTH_CONTEXT]?.tenantId, 'tenant-fixed');
  });
});
