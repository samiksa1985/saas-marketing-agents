import { cookies } from 'next/headers';
import type { BrowserAuthSession } from './browser-auth-types';

const sessionCookieName = process.env.NODE_ENV === 'production'
  ? '__Host-codecore_session'
  : 'codecore_session';

export interface BrowserSessionContext {
  session: BrowserAuthSession;
  apiCookie?: string;
}

export async function getBrowserSessionContext(): Promise<BrowserSessionContext> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName)?.value;
  if (!sessionId || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
    return { session: { authenticated: false } };
  }
  const configuredApi = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
  let apiOrigin: string;
  try {
    const parsed = new URL(configuredApi);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error('invalid API origin');
    }
    apiOrigin = parsed.origin;
  } catch {
    throw new Error('API_BASE_URL must be a valid absolute HTTP URL');
  }
  const apiCookie = `${sessionCookieName}=${sessionId}`;
  const response = await fetch(new URL('/browser-auth/session', apiOrigin), {
    headers: {
      accept: 'application/json',
      cookie: apiCookie,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Browser session lookup failed with status ${response.status}`);
  const result = await response.json() as BrowserAuthSession;
  if (
    typeof result !== 'object' ||
    result === null ||
    typeof result.authenticated !== 'boolean' ||
    (result.authenticated &&
      (typeof result.tenantId !== 'string' ||
        typeof result.csrfToken !== 'string' ||
        !Array.isArray(result.permissions) ||
        !Array.isArray(result.tenants)))
  ) {
    throw new Error('Browser session lookup returned an invalid response');
  }
  return { session: result, apiCookie };
}
