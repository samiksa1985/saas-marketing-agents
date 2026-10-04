import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-codecore_session'
  : 'codecore_session';
const TRANSACTION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-codecore_oidc_tx'
  : 'codecore_oidc_tx';

interface ForwardOptions {
  cookie?: 'session' | 'transaction';
  redirect?: 'identity-provider' | 'same-origin';
  method?: string;
  includeBody?: boolean;
}

function apiOrigin(): string {
  const configured = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('API_BASE_URL must be an absolute HTTP URL');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('API_BASE_URL must be an absolute HTTP URL without credentials or query');
  }
  return parsed.origin;
}

function safeLocation(location: string, mode: ForwardOptions['redirect'], request: NextRequest): URL | undefined {
  try {
    const target = new URL(location, request.nextUrl.origin);
    if (mode === 'same-origin') {
      return target.origin === request.nextUrl.origin &&
        location.startsWith('/') &&
        !location.startsWith('//') &&
        !location.includes('\\')
        ? target
        : undefined;
    }
    if (mode === 'identity-provider') {
      return !target.username &&
        !target.password &&
        !target.hash &&
        (target.protocol === 'https:' ||
        (process.env.NODE_ENV !== 'production' && target.protocol === 'http:')
        )
        ? target
        : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function forwardAuthRequest(
  request: NextRequest,
  apiPath: string,
  options: ForwardOptions = {},
): Promise<NextResponse> {
  let url: URL;
  try {
    url = new URL(apiPath, apiOrigin());
  } catch {
    return NextResponse.json({ error: 'Authentication service is unavailable' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  url.search = request.nextUrl.search;

  const headers = new Headers({ accept: 'application/json' });
  if (options.cookie) {
    const name = options.cookie === 'session' ? SESSION_COOKIE : TRANSACTION_COOKIE;
    const cookie = request.cookies.get(name)?.value;
    if (cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie)) headers.set('cookie', `${name}=${cookie}`);
  }
  const origin = request.headers.get('origin');
  if (origin) headers.set('origin', origin);
  const csrfToken = request.headers.get('x-csrf-token');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);
  const requestId = request.headers.get('x-request-id');
  if (requestId && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) {
    headers.set('x-request-id', requestId);
  }

  let body: ArrayBuffer | undefined;
  const method = options.method ?? request.method;
  if (options.includeBody) {
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      return NextResponse.json({ error: 'JSON request body required' }, {
        status: 415,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 1_048_576) {
      return NextResponse.json({ error: 'Request body too large' }, {
        status: 413,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    body = await request.arrayBuffer();
    if (body.byteLength > 1_048_576) {
      return NextResponse.json({ error: 'Request body too large' }, {
        status: 413,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    headers.set('content-type', 'application/json');
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json({ error: 'Authentication service is unavailable' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const location = upstream.headers.get('location');
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    const target = safeLocation(location, options.redirect, request);
    if (!target) {
      return NextResponse.json({ error: 'Authentication redirect was rejected' }, {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const response = NextResponse.redirect(target, upstream.status);
    const cookie = upstream.headers.get('set-cookie');
    if (cookie) response.headers.append('set-cookie', cookie);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const cookie = upstream.headers.get('set-cookie');
  if (cookie) responseHeaders.append('set-cookie', cookie);
  const responseBody = upstream.status === 204 || upstream.status === 304
    ? null
    : await upstream.arrayBuffer();
  return new NextResponse(responseBody, { status: upstream.status, headers: responseHeaders });
}
