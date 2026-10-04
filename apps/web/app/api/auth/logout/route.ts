import { NextRequest } from 'next/server';
import { forwardAuthRequest } from '../proxy';

export async function POST(request: NextRequest) {
  return forwardAuthRequest(request, '/browser-auth/logout', { cookie: 'session' });
}
