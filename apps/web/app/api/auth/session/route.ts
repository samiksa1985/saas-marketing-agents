import { NextRequest } from 'next/server';
import { forwardAuthRequest } from '../proxy';

export async function GET(request: NextRequest) {
  return forwardAuthRequest(request, '/browser-auth/session', { cookie: 'session' });
}
