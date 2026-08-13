/** Rich AliExpress search filters for the SHIXATO dashboard */

export type SearchSort =
  | "default"
  | "orders"
  | "price_asc"
  | "price_desc"
  | "newest";

export interface ProductSearchFilters {
  /** Free-text keywords (optional if `category` is set) */
  query?: string;
  /** Category id from PRODUCT_CATEGORIES — used when query is empty */
  category?: string;
  page?: number;
  /** AliExpress page locale — `ar` returns Arabic titles when available */
  locale?: "ar" | "en";
  /** Smart-search preset grade (diagnostics only) */
  presetGrade?: "starter" | "balanced" | "pro";
  /**
   * strict = hard exclude (manual search default)
   * soft = score + rank, keep top results (presets default)
   * off = return all parsed
   */
  filterMode?: "strict" | "soft" | "off";
  /** When false, AE URL uses query+sort only — filters applied locally (more results) */
  applyUrlFilters?: boolean;
  /** Fetch multiple AE pages and merge (default 2 for presets, up to 8 for turbo) */
  fetchPages?: number;

  /** URL / SSR filters sent to AliExpress */
  sort?: SearchSort;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  shipToCountry?: string;
  shipFromCountry?: string;
  freeShipping?: boolean;
  choiceOnly?: boolean;
  highRatedSellers?: boolean;
  unitPrice?: boolean;

  /** Post-filters applied on parsed cards */
  minSold?: number;
  maxSold?: number;
  minRating?: number;
  minReviews?: number;
  maxNegativeRate?: number;
  minDiscountPercent?: number;
  requireViralBadge?: boolean;
  requireFreeShippingBadge?: boolean;
  excludeKeywords?: string;
  includeKeywords?: string;

  /** Sellability helpers */
  targetSellingPrice?: number;
  minMarginPercent?: number;

  /** Prefer trustworthy + unique listings (default for smart search) */
  discoveryMode?: boolean;
  /** Boost/filter listings from this launch year (e.g. 2026) */
  minLaunchYear?: number;
}

export const SEARCH_SORT_MAP: Record<SearchSort, string | undefined> = {
  default: undefined,
  orders: "total_tranpro_desc",
  price_asc: "price_asc",
  price_desc: "price_desc",
  newest: "latest_desc",
};
