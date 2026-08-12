/**
 * AliExpress wholesale search URL contract (PC web, verified Aug 2026).
 *
 * Canonical pattern:
 *   https://www.aliexpress.com/w/wholesale-{slug}.html?{params}
 *
 * Legacy redirect (avoid — extra round-trip):
 *   https://www.aliexpress.com/wholesale?SearchText={query}
 *
 * Currency and ship-to region are driven by the `aep_usuc_f` cookie
 * (`c_tp` + `region`), not by URL query params on the wholesale page.
 */

export const ALIEXPRESS_WHOLESALE_BASE = "https://www.aliexpress.com/w";

/** Official query parameters accepted on `/w/wholesale-*.html` */
export const ALIEXPRESS_SEARCH_URL_PARAMS = {
  SortType: {
    description: "Sort order",
    values: {
      default: "Best match",
      total_tranpro_desc: "Orders (most sold)",
      price_asc: "Price low → high",
      price_desc: "Price high → low",
      latest_desc: "Newest listings",
    },
  },
  minPrice: {
    description: "Minimum price in page currency (cookie `c_tp`)",
    example: "5",
  },
  maxPrice: {
    description: "Maximum price in page currency",
    example: "50",
  },
  shipFromCountry: {
    description: "Ship-from country ISO-2 (comma-separated for multiple)",
    example: "CN,US",
  },
  shipCountry: {
    description: "Ship-to destination ISO-2",
    example: "SA",
  },
  isFreeShip: {
    description: "Free shipping filter",
    values: { y: "Enabled" },
  },
  g: {
    description: "AliExpress Choice filter",
    values: { y: "Choice items only" },
  },
  isFavorite: {
    description: "High-rated sellers (4★+)",
    values: { y: "Enabled" },
  },
  isUnitPrice: {
    description: "Show price per piece",
    values: { y: "Enabled" },
  },
  page: {
    description: "Page number (SSR pagination; infinite scroll on site)",
    example: "2",
  },
} as const;

/** Slugify free-text query for the wholesale path segment */
export function slugifyWholesaleQuery(query: string): string {
  const ascii = query
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
  const slug = ascii
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "product";
}
