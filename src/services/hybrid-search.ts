import { resolveSearchQuery } from "../data/categories";
import type {
  AliExpressListing,
  AliExpressSearchResult,
  Env,
  ProductSearchFilters,
} from "../types";
import { HttpError } from "../utils/http";
import { deepSearchPool } from "./deep-search";
import { hasAliExpressAccessToken } from "./aliexpress-credentials";
import { enrichListingsFromApi } from "./listing-enricher";
import { AliExpressService } from "./aliexpress";
import { computeWowHeuristic } from "./wow-scoring";

export type HybridSearchMeta = {
  source: "api" | "scraping" | "hybrid";
  apiEnrichmentAvailable: boolean;
  apiMerged?: number;
  enrichedCount?: number;
  scrapeCount?: number;
  keywordsTried?: string[];
  keywordFallbackUsed?: boolean;
  stoppedEarly?: boolean;
};

const MAX_RESULTS_DISPLAY = 120;

function normalizeFilters(filters: ProductSearchFilters): ProductSearchFilters {
  return {
    ...filters,
    page: filters.page && filters.page > 0 ? filters.page : 1,
    sort: filters.sort ?? "orders",
    currency: (filters.currency || "USD").toUpperCase(),
    shipToCountry: (filters.shipToCountry || "SA").toUpperCase(),
    locale: filters.locale === "en" ? "en" : "ar",
    filterMode: filters.filterMode ?? "soft",
    applyUrlFilters: false,
    fetchPages: Math.min(Math.max(filters.fetchPages ?? 3, 1), 8),
  };
}

function finalizeResults(
  pool: AliExpressListing[],
  normalized: ProductSearchFilters,
): AliExpressListing[] {
  const service = new AliExpressService();

  if (normalized.filterMode === "off") {
    return pool.slice(0, MAX_RESULTS_DISPLAY);
  }

  const filtered = service.refilterListings(pool, normalized);
  if (filtered.length > 0) return filtered.slice(0, MAX_RESULTS_DISPLAY);
  return pool.slice(0, MAX_RESULTS_DISPLAY);
}

async function runHybridSearch(
  env: Env,
  filters: ProductSearchFilters,
  hasToken: boolean,
): Promise<
  AliExpressSearchResult & {
    apiMerged?: number;
    enrichedCount?: number;
    meta?: HybridSearchMeta;
  }
> {
  const resolved = resolveSearchQuery({
    query: filters.query,
    category: filters.category,
  });
  if (resolved.query.length < 2) {
    throw new HttpError(
      400,
      "اختر فئة أو اكتب كلمة بحث — البحث الفارغ يحتاج فئة على الأقل",
    );
  }

  const normalized = normalizeFilters({ ...filters, query: resolved.query });
  const fetchPages = normalized.fetchPages ?? 3;

  const deep = await deepSearchPool(env, {
    categoryId: resolved.categoryId,
    primaryQuery: resolved.query,
    fetchPages,
    maxKeywords: resolved.categoryId ? 6 : 3,
    targetPoolSize: 60,
    currency: normalized.currency,
    shipToCountry: normalized.shipToCountry,
    locale: normalized.locale,
  });

  const pool = deep.pool;

  if (pool.length === 0) {
    throw new HttpError(
      502,
      hasToken
        ? "لم نجد منتجات — جرّب اختيار فئة من القائمة أو كلمة بحث أخرى"
        : "لم نجد منتجات — اربط AliExpress API أو جرّب كلمة أخرى",
    );
  }

  let results = finalizeResults(pool, normalized);

  const enrichTarget = results.slice(0, 16);
  let enrichedCount = 0;
  if (hasToken && enrichTarget.length) {
    const enrichedRaw = await enrichListingsFromApi(env, enrichTarget, {
      limit: 16,
      concurrency: 4,
    });
    const enriched = Array.isArray(enrichedRaw) ? enrichedRaw : enrichTarget;
    const enrichedMap = new Map(enriched.map((l) => [l.aliexpressId, l]));
    results = results.map((l) => enrichedMap.get(l.aliexpressId) ?? l);
    enrichedCount = enriched.filter((l) =>
      l.enrichmentSources?.includes("api"),
    ).length;
  }

  const apiMerged = deep.apiCount;
  const scrapeCount = deep.scrapeCount;
  const source: HybridSearchMeta["source"] =
    apiMerged > 0 && scrapeCount > 0
      ? "hybrid"
      : apiMerged > 0
        ? "api"
        : "scraping";

  const service = new AliExpressService();
  const searchUrl = service.buildSearchUrl(normalized, { minimal: true });

  let warning = `${results.length} منتج من ${deep.keywordsTried.length} كلمات · ${pool.length} خام`;
  if (deep.stoppedEarly) warning += " · توقّف مبكرًا";
  if (source === "hybrid") warning += ` · ${apiMerged} من API`;
  if (enrichedCount > 0) warning += ` · ${enrichedCount} مُثرى`;

  return {
    query: resolved.query,
    page: normalized.page!,
    searchUrl,
    searchUrlUsed: searchUrl,
    filtersApplied: {
      ...normalized,
      categoryLabelAr: resolved.categoryLabelAr,
      freeTextQuery: (normalized.query ?? "").trim() || null,
      fetchPages,
      searchSource: source,
    },
    results,
    resultsBeforeFilter: pool,
    totalParsed: pool.length,
    totalAfterFilter: results.length,
    warning,
    apiMerged,
    enrichedCount,
    meta: {
      source,
      apiEnrichmentAvailable: hasToken,
      apiMerged,
      enrichedCount,
      scrapeCount,
      keywordsTried: deep.keywordsTried,
      keywordFallbackUsed: deep.keywordsTried.length > 1,
      stoppedEarly: deep.stoppedEarly,
    },
  };
}

/**
 * Hybrid search — deep parallel scrape + API merged, enriched when token exists.
 */
export async function hybridAliExpressSearch(
  env: Env,
  filters: ProductSearchFilters,
): Promise<
  AliExpressSearchResult & {
    apiMerged?: number;
    enrichedCount?: number;
    meta?: HybridSearchMeta;
  }
> {
  const hasToken = await hasAliExpressAccessToken(env);
  return runHybridSearch(env, filters, hasToken);
}

/** Keyword search for auto-discover — single keyword fast path. */
export async function searchListingsForKeyword(
  env: Env,
  keyword: string,
  options: {
    fetchPages: number;
    currency: string;
    enrichLimit?: number;
  },
): Promise<AliExpressListing[]> {
  const deep = await deepSearchPool(env, {
    primaryQuery: keyword,
    fetchPages: options.fetchPages,
    maxKeywords: 1,
    targetPoolSize: 80,
    currency: options.currency,
  });

  let listings = deep.pool;
  const hasToken = await hasAliExpressAccessToken(env);
  const enrichLimit = options.enrichLimit ?? 0;
  if (hasToken && enrichLimit > 0 && listings.length) {
    listings = await enrichListingsFromApi(env, listings, {
      limit: enrichLimit,
      concurrency: 3,
    });
  }
  return listings;
}
