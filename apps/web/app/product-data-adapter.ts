import type { ProductSurfaceComposition } from '@platform/contracts';
import { CanonicalApiClient } from './canonical-api.js';
import {
  assessProductAccess,
  productSurfaceEndpoint,
  type ProductAccess,
  type ProductDataState,
  type ProductView,
} from './product-model.js';

/**
 * Maps the approved API composition response to the display state. It never
 * substitutes a metric or integration result when the backend says empty or
 * unavailable.
 */
export async function loadProductSurface(
  client: CanonicalApiClient,
  view: ProductView,
  access: ProductAccess,
): Promise<ProductDataState<ProductSurfaceComposition>> {
  const accessState = assessProductAccess(view, access);

  if (accessState === 'missing-context') {
    return { kind: 'error', message: { en: 'A tenant session is required.', ar: 'تتطلب جلسة مستأجر.' } };
  }
  if (accessState === 'permission-denied') {
    return { kind: 'permission-denied', permission: view.requiredPermission };
  }
  if (accessState === 'entitlement-unavailable') {
    return { kind: 'entitlement-unavailable', entitlement: view.entitlement! };
  }

  const composition = await client.productSurface(view.id);
  if (composition.state === 'ready') return { kind: 'ready', data: composition };
  if (composition.state === 'empty') {
    return {
      kind: 'empty',
      message: { en: composition.reason ?? 'No canonical records are available.', ar: composition.reason ?? 'لا توجد سجلات قانونية متاحة.' },
    };
  }
  return {
    kind: 'unavailable',
    compositionEndpoint: productSurfaceEndpoint(view.id),
    message: { en: composition.reason ?? 'Canonical composition is unavailable.', ar: composition.reason ?? 'التجميع القانوني غير متاح.' },
  };
}
