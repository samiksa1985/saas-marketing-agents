/**
 * Shared session credential for DB integration suites that authenticate as the
 * cluster-global codecore_app role. Test files run concurrently, so each one
 * must NOT rotate the role to a private per-process password. The first suite
 * to run creates a random password (atomic create-exclusive) and the rest read
 * it, so idempotent provisioning always converges to the same value.
 *
 * The value lives in the OS temp directory, is never printed, never committed,
 * and only ever guards a disposable local PostgreSQL container.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SESSION_FILE = join(tmpdir(), 'codecore-app-test-password');
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function sharedTestAppPassword(): string {
  try {
    const existing = readFileSync(SESSION_FILE, 'utf8').trim();
    if (existing.length >= 32 && Date.now() - statSync(SESSION_FILE).mtimeMs < MAX_AGE_MS) {
      return existing;
    }
  } catch {
    // No usable session password yet.
  }
  const fresh = randomBytes(24).toString('hex');
  try {
    writeFileSync(SESSION_FILE, fresh, { flag: 'wx', mode: 0o600 });
  } catch {
    // Another concurrent suite won the create race; fall through to its value.
  }
  return readFileSync(SESSION_FILE, 'utf8').trim();
}
