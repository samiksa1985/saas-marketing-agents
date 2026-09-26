import { CanonicalApiClient, type CanonicalReadEndpoint } from './canonical-api';
import {
  assessProductAccess,
  type ProductAccess,
  type ProductDataState,
  type ProductView,
} from './product-model';

/**
 * The product never fabricates a composition from unrelated API responses.
 * It loads the view's first concrete GET source only after server-derived
 * tenant access is supplied; endpoints needing an entity key stay unavailable.
 */
export async function loadProductSurface(
  client: CanonicalApiClient,
  view: ProductView,
  access: ProductAccess,
): Promise<ProductDataState<unknown>> {
  const accessState = assessProductAccess(view, access);
  if (accessState === 'missing-context')
    return {
      kind: 'error',
      message: { en: 'A tenant session is required.', ar: 'تتطلب جلسة مستأجر.' },
    };
  if (accessState === 'permission-denied')
    return { kind: 'permission-denied', permission: view.requiredPermission };
  if (accessState === 'entitlement-unavailable')
    return { kind: 'entitlement-unavailable', entitlement: view.entitlement! };

  const endpoint = view.dataSources[0]?.endpoint;
  if (!endpoint || !endpoint.startsWith('GET /') || endpoint.includes(':')) {
    return {
      kind: 'unavailable',
      compositionEndpoint: endpoint ?? 'unavailable',
      message: {
        en: 'This view needs a selected record or authoritative source.',
        ar: 'تتطلب هذه الواجهة سجلاً محدداً أو مصدراً موثوقاً.',
      },
    };
  }
  try {
    const data = await client.read(endpoint.slice(4) as CanonicalReadEndpoint);
    if (Array.isArray(data) && data.length === 0)
      return {
        kind: 'empty',
        message: { en: 'No canonical records are available.', ar: 'لا توجد سجلات موثوقة متاحة.' },
      };
    return { kind: 'ready', data };
  } catch {
    return {
      kind: 'error',
      message: {
        en: 'The authoritative source could not be loaded.',
        ar: 'تعذر تحميل المصدر الموثوق.',
      },
    };
  }
}
