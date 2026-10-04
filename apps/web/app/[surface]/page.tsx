import { notFound } from 'next/navigation';

import { getProductView } from '../product-model';
import { ProductShell } from '../product-shell';
import { CanonicalApiClient } from '../canonical-api';
import { loadProductSurface } from '../product-data-adapter';
import { pilotAccess, signedOutAccess } from '../pilot-access';
import { getBrowserSessionContext, type BrowserSessionContext } from '../browser-session';

export const dynamic = 'force-dynamic';

const isPilotMode = Boolean(process.env.NEXT_PUBLIC_PILOT_TENANT_ID);

export default async function SurfacePage({
  params,
}: Readonly<{
  params: Promise<{
    surface: string;
  }>;
}>) {
  const { surface } = await params;
  const view = getProductView(surface);
  if (!view || view.id === 'overview') {
    notFound();
  }
  const browserContext: BrowserSessionContext = isPilotMode
    ? { session: { authenticated: false } }
    : await getBrowserSessionContext();
  const client = isPilotMode
    ? new CanonicalApiClient({ baseUrl: process.env.WEB_URL ?? 'http://127.0.0.1:3000', mode: 'pilot' })
    : browserContext.session.authenticated
      ? new CanonicalApiClient({
          baseUrl: 'http://127.0.0.1:3000',
          mode: 'bff',
          ...(browserContext.apiCookie ? { cookie: browserContext.apiCookie } : {}),
        })
      : new CanonicalApiClient({ baseUrl: 'http://127.0.0.1:4000', accessToken: '' });
  const access = isPilotMode
    ? pilotAccess
    : browserContext.session.authenticated
      ? {
          tenantContext: 'available' as const,
          permissions: browserContext.session.permissions ?? [],
          entitlements: [],
        }
      : signedOutAccess;
  const dataState = await loadProductSurface(client, view, access);
  return (
    <ProductShell
      initialView={view.id}
      pilotDataState={dataState}
      isPilotAuthenticated={isPilotMode}
      pilotTenantName={process.env.NEXT_PUBLIC_PILOT_TENANT_NAME ?? 'CODECORE Growth Pilot'}
      browserSession={browserContext.session}
    />
  );
}
