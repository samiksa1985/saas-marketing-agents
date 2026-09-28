import { ProductShell } from './product-shell';
import { getProductView } from './product-model';
import { CanonicalApiClient } from './canonical-api';
import { loadProductSurface } from './product-data-adapter';
import { pilotAccess, signedOutAccess } from './pilot-access';

export const dynamic = 'force-dynamic';

const pilotTenantId = process.env.NEXT_PUBLIC_PILOT_TENANT_ID ?? null;
const isPilotMode = pilotTenantId !== null;

function createApiClient() {
  if (isPilotMode) {
    return new CanonicalApiClient({ baseUrl: process.env.WEB_URL ?? 'http://127.0.0.1:3000', mode: 'pilot' });
  }
  return new CanonicalApiClient({ baseUrl: 'http://127.0.0.1:4000', accessToken: '' });
}

export default async function HomePage() {
  const client = createApiClient();
  const view = getProductView('overview')!;
  const access = isPilotMode ? pilotAccess : signedOutAccess;
  const dataState = await loadProductSurface(client, view, access);

  return (
    <ProductShell
      initialView="overview"
      pilotDataState={dataState}
      isPilotAuthenticated={isPilotMode}
      pilotTenantName={process.env.NEXT_PUBLIC_PILOT_TENANT_NAME ?? 'CODECORE Growth Pilot'}
    />
  );
}
