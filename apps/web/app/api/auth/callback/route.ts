import { NextRequest } from 'next/server';
import { forwardAuthRequest } from '../proxy';

export async function GET(request: NextRequest) {
  return forwardAuthRequest(request, '/browser-auth/callback', {
    cookie: 'transaction',
    redirect: 'same-origin',
  });
}
