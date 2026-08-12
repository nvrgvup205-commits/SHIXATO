/** Shared TypeScript interfaces for the AliExpress → Shopify pipeline */

export type ProductStatus =
  | "pending"
  | "filtered_out"
  | "approved"
  | "synced"
  | "failed"
  | "archived";

export type SyncStatus = "success" | "failed" | "partial";

export interface Env {
  ENVIRONMENT: string;
  SHOPIFY_STORE_DOMAIN: string;
  SHOPIFY_API_VERSION: string;
  SHOPIFY_ADMIN_API_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  API_KEY: string;
  /** Simple dashboard login PIN (default 1111) */
  DASHBOARD_PIN?: string;
  DEFAULT_MARKUP?: string;
  MAX_PRODUCT_IMAGES?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  /** Optional Workers AI binding */
  AI?: Ai;
}

export interface AliExpressVariant {
  sku: string;
  title: string;
  price: number;
  currency: string;
  available: boolean;
  options: Record<string, string>;
  image?: string;
}

export interface AliExpressProduct {
  aliexpressId: string;
  url: string;
  title: string;
  descriptionHtml: string;
  currency: string;
  originalPrice: number;
  minPrice: number;
  maxPrice: number;
  images: string[];
  variants: AliExpressVariant[];
  category?: string;
  attributes: Record<string, string>;
  scrapedAt: string;
}

export interface ProductRecord {
  id: string;
  aliexpress_id: string;
  title: string;
  original_price: number;
  selling_price: number;
  images: string[];
  status: ProductStatus;
  description_html?: string | null;
  shopify_product_id?: string | null;
  shopify_handle?: string | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
}

export interface FavoriteRecord {
  id: string;
  aliexpress_id: string;
  title: string;
  original_price: number;
  currency: string;
  listing: AliExpressListing | Record<string, unknown>;
  notes?: string | null;
  preset_grade?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface SyncLogRecord {
  id: string;
  product_id: string | null;
  aliexpress_id: string | null;
  shopify_product_id: string | null;
  action: string;
  status: SyncStatus;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface AiFilterResult {
  approved: boolean;
  score: number;
  reason: string;
  suggestedTitle?: string;
  tags?: string[];
}

export type AliExpressShippingType =
  | "free"
  | "conditional_free"
  | "paid"
  | "unknown";

/** Search-result card used when PDP scrape is blocked */
export interface AliExpressListing {
  aliexpressId: string;
  title: string;
  url: string;
  image: string;
  images?: string[];
  /** Current sale / card price */
  originalPrice: number;
  /** List price before discount when available */
  listPrice?: number;
  currency: string;
  sold?: string;
  soldCount?: number;
  rating?: number;
  reviewCount?: number;
  /** Estimated share of non-5★ reviews (0–100) from available card signals */
  negativeRateEstimate?: number;
  discountPercent?: number;
  badges?: string[];
  isChoice?: boolean;
  isFreeShipping?: boolean;
  isViral?: boolean;
  shipFrom?: string;
  /** Destination country ISO-2 from search card trace */
  shipTo?: string;
  /** Human label e.g. AliExpress Standard Shipping */
  shippingMethod?: string;
  shippingMethodCode?: string;
  shippingCarrier?: string;
  /** e.g. Delivery: Aug 18 - 23 */
  deliveryEstimate?: string;
  shippingType?: AliExpressShippingType;
  /** Free shipping note from AE selling point */
  shippingNote?: string;
  shippingCost?: number;
  shippingCostCurrency?: string;
  isLocalWarehouse?: boolean;
  storeLaunchDate?: string;
  /** Trust / discovery signals computed locally after search */
  trustScore?: number;
  uniquenessScore?: number;
  discoveryScore?: number;
  suspiciousMetrics?: boolean;
  launchYear?: number;
  isCurrentYear?: boolean;
  genericTitle?: boolean;
  problemSolvingTitle?: boolean;
  /** Original English title when auto-translated to Arabic */
  titleEn?: string;
  /** Saudi marketing hook from AI analysis */
  hookAr?: string;
  adCopyAr?: string;
  /** Full Arabic product description (plain or simple HTML) for Shopify */
  descriptionAr?: string;
  pros?: string[];
  aiScore?: number;
  /** Override selling price saved while editing favorites */
  sellingPrice?: number;
  /** Cached AI analysis from dashboard (used when saving to favorites) */
  aiAnalyzed?: {
    suggestedTitle?: string;
    hookAr?: string;
    adCopyAr?: string;
    descriptionAr?: string;
    pros?: string[];
    score?: number;
    suggestedSellingPrice?: number;
  };
}

export interface AliExpressSearchResult {
  query: string;
  page: number;
  /** Full filtered AliExpress wholesale URL (official query params) */
  searchUrl: string;
  /** URL actually fetched when AE rejects the full filtered URL */
  searchUrlUsed?: string;
  filtersApplied: Record<string, unknown>;
  results: AliExpressListing[];
  /** Results before local post-filters (for "show without filters" UX) */
  resultsBeforeFilter?: AliExpressListing[];
  totalParsed: number;
  totalAfterFilter: number;
  /** Arabic/English hint when filters wipe results or AE soft-fails */
  warning?: string;
  usedFallbackUrl?: boolean;
  /** Count of titles auto-translated to Arabic */
  titlesTranslated?: number;
}

export type { ProductSearchFilters, SearchSort } from "./search";

export interface ImportProductInput {
  url?: string;
  aliexpressId?: string;
  /** Skip AI filter and force sync */
  force?: boolean;
  /** Override selling price (store currency) */
  sellingPrice?: number;
  /** Markup multiplier if sellingPrice omitted (default from env) */
  markup?: number;
  /**
   * When AliExpress product pages are blocked, pass listing data from search
   * so import can proceed without a full PDP scrape.
   */
  listing?: AliExpressListing;
}

export interface ImportProductResult {
  product: ProductRecord;
  filter: AiFilterResult;
  shopify?: {
    productId: string;
    handle: string;
  };
  synced: boolean;
}

export interface ShopifyCreatedProduct {
  id: string;
  handle: string;
  title: string;
  status: string;
  variants: Array<{ id: string; sku: string | null; price: string }>;
}

export interface ShopifyGraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: ShopifyGraphQLError[];
  extensions?: Record<string, unknown>;
}
