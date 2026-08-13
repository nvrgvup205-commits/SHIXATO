import {
  buildSearchKeywordChain,
  getCategorySearchKeywords,
} from "../data/category-keywords";
import type { AliExpressListing, Env, ProductSearchFilters } from "../types";
import { mapApiSearchProductToListing } from "./api-listing-mapper";
import { AliExpressApi } from "./aliexpress-api";
import { scrapeSearchKeyword } from "./aliexpress-scrape";
import { hasAliExpressAccessToken } from "./aliexpress-credentials";
import { computeWowHeuristic } from "./wow-scoring";

export interface DeepSearchOptions {
  categoryId?: string;
  primaryQuery: string;
  extraKeywords?: string[];
  fetchPages?: number;
  maxKeywords?: number;
  targetPoolSize?: number;
  currency?: string;
  shipToCountry?: string;
  locale?: "ar" | "en";
}

export interface DeepSearchResult {
  pool: AliExpressListing[];
  keywordsTried: string[];
  scrapeCount: number;
  apiCount: number;
  stoppedEarly: boolean;
  errors: string[];
}

function mergeListings(
  primary: AliExpressListing[],
  secondary: AliExpressListing[],
): AliExpressListing[] {
  const byId = new Map<string, AliExpressListing>();
  for (const item of primary) byId.set(item.aliexpressId, item);
  for (const item of secondary) {
    if (!byId.has(item.aliexpressId)) byId.set(item.aliexpressId, item);
  }
  return [...byId.values()];
}

function rankPool(
  pool: AliExpressListing[],
  keyword?: string,
): AliExpressListing[] {
  return [...pool].sort((a, b) => {
    const sa = computeWowHeuristic(a, keyword).wowScore;
    const sb = computeWowHeuristic(b, keyword).wowScore;
    return sb - sa;
  });
}

async function fetchApiPool(
  env: Env,
  keyword: string | undefined,
  pages: number,
  currency?: string,
): Promise<AliExpressListing[]> {
  try {
    const api = await AliExpressApi.fromEnv(env);
    const byId = new Map<string, AliExpressListing>();

    if (keyword?.trim()) {
      for (let page = 1; page <= Math.min(pages, 4); page += 1) {
        const rows = await api.searchProductsByKeyword(keyword, page).catch(() => []);
        for (const row of rows) {
          const listing = mapApiSearchProductToListing(row, currency);
          if (listing.aliexpressId) byId.set(listing.aliexpressId, listing);
        }
        if (rows.length < 10) break;
      }
    }

    if (byId.size < 12) {
      const feedRows = await api.fetchRecommendFeed({
        keyword,
        pages: Math.min(pages, 3),
        strictKeyword: false,
      });
      for (const row of feedRows) {
        const listing = mapApiSearchProductToListing(row, currency);
        if (listing.aliexpressId && !byId.has(listing.aliexpressId)) {
          byId.set(listing.aliexpressId, listing);
        }
      }
    }

    return [...byId.values()];
  } catch (err) {
    console.warn("API search failed", err);
    return [];
  }
}

/**
 * Deep search — API first (if token), then sequential scrape per keyword.
 * No parallel AliExpress fetches (avoids Worker IP blocks + race conditions).
 */
export async function deepSearchPool(
  env: Env,
  options: DeepSearchOptions,
): Promise<DeepSearchResult> {
  const hasToken = await hasAliExpressAccessToken(env);
  const fetchPages = Math.min(Math.max(options.fetchPages ?? 2, 1), 4);
  const maxKeywords = Math.min(Math.max(options.maxKeywords ?? 6, 2), 10);
  const targetPoolSize = Math.max(options.targetPoolSize ?? 48, 20);
  const currency = (options.currency || "USD").toUpperCase();
  const shipTo = (options.shipToCountry || "SA").toUpperCase();
  const errors: string[] = [];

  const keywords = buildSearchKeywordChain(
    options.primaryQuery,
    options.categoryId,
    maxKeywords,
  );

  if (options.extraKeywords?.length) {
    for (const kw of options.extraKeywords) {
      const t = kw.trim();
      if (
        t.length >= 2 &&
        !keywords.some((q) => q.toLowerCase() === t.toLowerCase())
      ) {
        keywords.push(t);
      }
    }
  }

  const keywordList = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].slice(
    0,
    maxKeywords,
  );

  let pool: AliExpressListing[] = [];
  let scrapeCount = 0;
  let apiCount = 0;
  let stoppedEarly = false;

  const scrapeOpts = {
    pages: fetchPages,
    sort: "orders" as const,
    currency,
    shipToCountry: shipTo,
    locale: "en" as const,
  };

  // 1) API feed first — works even when scrape is blocked on Workers
  if (hasToken) {
    const apiItems = await fetchApiPool(
      env,
      options.primaryQuery,
      fetchPages + 1,
      currency,
    );
    apiCount += apiItems.length;
    pool = mergeListings(pool, apiItems);

    if (pool.length < targetPoolSize) {
      const broadApi = await fetchApiPool(env, undefined, 3, currency);
      apiCount += broadApi.length;
      pool = mergeListings(pool, broadApi);
    }
  }

  if (pool.length >= targetPoolSize) {
    return {
      pool: rankPool(pool, options.primaryQuery),
      keywordsTried: keywordList,
      scrapeCount,
      apiCount,
      stoppedEarly: true,
      errors,
    };
  }

  // 2) Sequential scrape — one keyword at a time (reliable on Workers)
  for (const keyword of keywordList) {
    if (pool.length >= targetPoolSize) {
      stoppedEarly = true;
      break;
    }

    try {
      const scraped = await scrapeSearchKeyword(keyword, scrapeOpts);
      scrapeCount += scraped.length;
      pool = mergeListings(pool, scraped);

      if (hasToken && pool.length < targetPoolSize) {
        const apiKw = await fetchApiPool(env, keyword, 2, currency);
        apiCount += apiKw.length;
        pool = mergeListings(pool, apiKw);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "scrape failed";
      errors.push(`${keyword}: ${msg}`);
    }

    if (pool.length >= targetPoolSize) {
      stoppedEarly = true;
      break;
    }
  }

  return {
    pool: rankPool(pool, options.primaryQuery),
    keywordsTried: keywordList,
    scrapeCount,
    apiCount,
    stoppedEarly,
    errors,
  };
}

export function resolveDiscoverKeywords(
  categoryId: string,
  limit = 8,
): string[] {
  return getCategorySearchKeywords(categoryId, limit);
}
