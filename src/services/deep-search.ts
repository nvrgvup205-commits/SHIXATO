import {
  buildSearchKeywordChain,
  getCategorySearchKeywords,
} from "../data/category-keywords";
import type { AliExpressListing, Env, ProductSearchFilters } from "../types";
import { runParallelBatches } from "../utils/rate-limiter";
import { mapApiSearchProductToListing } from "./api-listing-mapper";
import { AliExpressApi } from "./aliexpress-api";
import { AliExpressService } from "./aliexpress";
import { hasAliExpressAccessToken } from "./aliexpress-credentials";
import { computeWowHeuristic } from "./wow-scoring";

export interface DeepSearchOptions {
  categoryId?: string;
  primaryQuery: string;
  extraKeywords?: string[];
  fetchPages?: number;
  maxKeywords?: number;
  parallelBatch?: number;
  targetPoolSize?: number;
  currency?: string;
  shipToCountry?: string;
  locale?: "ar" | "en";
  filters?: Partial<ProductSearchFilters>;
}

export interface DeepSearchResult {
  pool: AliExpressListing[];
  keywordsTried: string[];
  scrapeCount: number;
  apiCount: number;
  stoppedEarly: boolean;
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

function baseFilters(
  options: DeepSearchOptions,
): ProductSearchFilters {
  return {
    page: 1,
    sort: "orders",
    locale: options.locale ?? "ar",
    filterMode: "off",
    applyUrlFilters: false,
    discoveryMode: false,
    currency: (options.currency || "USD").toUpperCase(),
    shipToCountry: (options.shipToCountry || "SA").toUpperCase(),
    fetchPages: Math.min(Math.max(options.fetchPages ?? 3, 1), 8),
    ...options.filters,
  };
}

async function scrapeKeyword(
  keyword: string,
  filters: ProductSearchFilters,
): Promise<AliExpressListing[]> {
  const service = new AliExpressService();
  const attempts: ProductSearchFilters[] = [
    { ...filters, query: keyword, locale: filters.locale ?? "ar" },
    { ...filters, query: keyword, locale: "en" },
  ];

  for (const attempt of attempts) {
    try {
      const result = await service.search(attempt);
      const items = result.resultsBeforeFilter ?? result.results ?? [];
      if (items.length > 0) return items;
    } catch {
      // try next locale / URL strategy
    }
  }
  return [];
}

async function apiKeywordPool(
  env: Env,
  keyword: string,
  fetchPages: number,
  currency?: string,
): Promise<AliExpressListing[]> {
  try {
    const api = await AliExpressApi.fromEnv(env);
    const rows = await api.fetchRecommendFeed({
      keyword,
      pages: Math.min(fetchPages, 4),
      strictKeyword: false,
    });
    return rows.map((row) => mapApiSearchProductToListing(row, currency));
  } catch {
    return [];
  }
}

async function fetchKeywordPool(
  env: Env,
  keyword: string,
  filters: ProductSearchFilters,
  hasToken: boolean,
): Promise<{ scrape: AliExpressListing[]; api: AliExpressListing[] }> {
  const [scrape, api] = await Promise.all([
    scrapeKeyword(keyword, filters),
    hasToken
      ? apiKeywordPool(env, keyword, filters.fetchPages ?? 3, filters.currency)
      : Promise.resolve([] as AliExpressListing[]),
  ]);
  return { scrape, api };
}

/**
 * Deep parallel search — the fastest reliable path to fill a product pool.
 * Uses curated category keywords, parallel batches, early exit, and dual URL strategies.
 */
export async function deepSearchPool(
  env: Env,
  options: DeepSearchOptions,
): Promise<DeepSearchResult> {
  const hasToken = await hasAliExpressAccessToken(env);
  const filters = baseFilters(options);
  const fetchPages = filters.fetchPages ?? 3;
  const maxKeywords = Math.min(Math.max(options.maxKeywords ?? 8, 3), 12);
  const parallelBatch = Math.min(Math.max(options.parallelBatch ?? 4, 2), 6);
  const targetPoolSize = Math.max(options.targetPoolSize ?? 48, 24);

  const keywords = buildSearchKeywordChain(
    options.primaryQuery,
    options.categoryId,
    maxKeywords,
  );

  if (options.extraKeywords?.length) {
    for (const kw of options.extraKeywords) {
      if (
        kw.trim().length >= 2 &&
        !keywords.some((q) => q.toLowerCase() === kw.toLowerCase())
      ) {
        keywords.push(kw.trim());
      }
    }
  }

  const keywordList = keywords.slice(0, maxKeywords);
  let pool: AliExpressListing[] = [];
  let scrapeCount = 0;
  let apiCount = 0;
  let stoppedEarly = false;

  await runParallelBatches(
    keywordList,
    parallelBatch,
    async (keyword) => {
      if (pool.length >= targetPoolSize) {
        stoppedEarly = true;
        return;
      }

      const { scrape, api } = await fetchKeywordPool(
        env,
        keyword,
        { ...filters, fetchPages },
        hasToken,
      );
      scrapeCount += scrape.length;
      apiCount += api.length;
      pool = mergeListings(pool, mergeListings(scrape, api));

      if (pool.length >= targetPoolSize) stoppedEarly = true;
    },
    250,
  );

  return {
    pool: rankPool(pool, options.primaryQuery),
    keywordsTried: keywordList,
    scrapeCount,
    apiCount,
    stoppedEarly,
  };
}

/** Resolve keywords for discover — curated first, no AI wait. */
export function resolveDiscoverKeywords(
  categoryId: string,
  limit = 8,
): string[] {
  return getCategorySearchKeywords(categoryId, limit);
}
