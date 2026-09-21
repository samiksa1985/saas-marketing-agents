import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:4000';
const PILOT_TOKEN = process.env.PILOT_API_TOKEN;

// This local-only boundary deliberately exposes only the read models rendered
// by the pilot. It must never become a bearer-token relay for mutations.
const allowedReadPaths = new Set([
  '/health',
  '/approvals',
  '/leads',
  '/opportunities',
  '/funnel',
  '/revenue-intelligence',
  '/revenue-attribution',
  '/acquisition-diagnostics',
  '/lead-routing-recommendations',
  '/customer-engagement/conversations',
  '/customer-engagement/handoffs',
  '/customer-engagement/follow-ups',
  '/customer-engagement/analytics',
  '/customer-journey/analytics',
  '/provider-integrations/bindings',
  '/provider-integrations/capabilities',
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Pilot proxy unavailable in production' }, { status: 404 });
  }
  if (!PILOT_TOKEN) {
    return NextResponse.json({ error: 'Pilot token not configured' }, { status: 503 });
  }

  const { path } = await params;
  const targetPath = `/${path.join('/')}`;
  if (!allowedReadPaths.has(targetPath)) {
    return NextResponse.json({ error: 'Pilot read endpoint not allowed' }, { status: 404 });
  }
  const searchParams = request.nextUrl.searchParams.toString();
  const targetUrl = `${API_BASE}${targetPath}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${PILOT_TOKEN}`,
      },
      cache: 'no-store',
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Upstream request failed' }, { status: 502 });
  }
}
