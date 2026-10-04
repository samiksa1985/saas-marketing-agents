import { NextRequest, NextResponse } from 'next/server';
import { forwardAuthRequest } from '../../auth/proxy';

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (
    path.length === 0 ||
    path.some((segment) => !/^[A-Za-z0-9_-]{1,128}$/.test(segment))
  ) {
    return NextResponse.json({ error: 'API endpoint not allowed' }, { status: 404 });
  }
  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return NextResponse.json({ error: 'API method not allowed' }, { status: 405 });
  }
  return forwardAuthRequest(request, `/${path.map(encodeURIComponent).join('/')}`, {
    cookie: 'session',
    method,
    includeBody: !['GET', 'HEAD'].includes(method),
  });
}

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
