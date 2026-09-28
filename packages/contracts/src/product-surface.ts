export const PRODUCT_SURFACE_IDS = [
  'home', 'ai-command', 'company-intelligence', 'market-intelligence',
  'icp-personas', 'strategy', 'campaigns', 'content-studio', 'creative-studio',
  'seo', 'sales-crm', 'customer-success', 'analytics-experiments', 'finance-cfo',
  'automation', 'knowledge', 'approvals', 'workflows-operations', 'ai-team',
  'business-mentor', 'billing-usage', 'settings', 'admin-governance',
] as const;

export type ProductSurfaceId = (typeof PRODUCT_SURFACE_IDS)[number];

export type ProductSurfaceCompositionState = 'ready' | 'empty' | 'unavailable';

/** A typed, factual composition response; data is absent rather than invented. */
export interface ProductSurfaceComposition {
  surface: ProductSurfaceId;
  state: ProductSurfaceCompositionState;
  source: string;
  requiredEntitlement?: string;
  reason?: string;
  data?: unknown;
}
