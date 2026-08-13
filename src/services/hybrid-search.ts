import { buildSearchKeywordChain } from "../data/category-keywords";
import { resolveSearchQuery } from "../data/categories";
import type {
  AliExpressListing,
  AliExpressSearchResult,
  Env,
  ProductSearchFilters,
} from "../types";
import { HttpError } from "../utils/http";
import { mapApiSearchProductToListing } from "./api-listing-mapper";
import { AliExpressApi } from "./aliexpress-api";
import { AliExpressService } from "./aliexpress";
import { hasAliExpressAccessToken } from "./aliexpress-credentials";
import { enrichListingsFromApi } from "./listing-enricher";
import { computeWowHeuristic } from "./wow-scoring";

export type HybridSearchMeta = {
  source: "api" | "scraping" | "hybrid";
  apiEnrichmentAvailable: boolean;
  apiMerged?: number;
  enrichedCount?: number;
  scrapeCount?: number;
  keywordsTried?: string[];
  keywordFallbackUsed?: boolean;
};

const MAX_RESULTS_DISPLAY = 120;
const MIN_POOL_BEFORE_FALLBACK = 12;
const KEYWORD_FALLBACK_LIMIT = 8;

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

function rankByImpressiveness(
  listings: AliExpressListing[],
  keyword?: string,
): AliExpressListing[] {
  return [...listings].sort((a, b) => {
    const sa = computeWowHeuristic(a, keyword).wowScore;
    const sb = computeWowHeuristic(b, keyword).wowScore;
    return sb - sa;
  });
}

function normalizeFilters(filters: ProductSearchFilters): ProductSearchFilters {
  return {
    ...filters,
    page: filters.page && filters.page > 0 ? filters.page : 1,
    sort: filters.sort ?? "orders",
    currency: (filters.currency || "USD").toUpperCase(),
    shipToCountry: (filters.shipToCountry || "SA").toUpperCase(),
    locale: filters.locale === "en" ? "en" : "ar",
    filterMode: filters.filterMode ?? "soft",
    applyUrlFilters: filters.applyUrlFilters ?? false,
    fetchPages: Math.min(
      Math.max(filters.fetchPages ?? 4, 1),
      8,
    ),
  };
}

async function fetchApiListings(
  env: Env,
  keyword: string,
  fetchPages: number,
  currency?: string,
): Promise<AliExpressListing[]> {
  const api = await AliExpressApi.fromEnv(env);
  const rows = await api.fetchRecommendFeed({
    keyword,
    pages: fetchPages,
    strictKeyword: false,
  });

  let pool = rows.map((row) => mapApiSearchProductToListing(row, currency));

  if (pool.length < 12) {
    const broader = await api.fetchRecommendFeed({
      pages: Math.min(fetchPages + 2, 8),
      strictKeyword: false,
    });
    pool = mergeListings(
      pool,
      broader.map((row) => mapApiSearchProductToListing(row, currency)),
    );
  }

  return pool;
}

async function fetchScrapeListings(
  filters: ProductSearchFilters,
  resolvedQuery: string,
): Promise<AliExpressSearchResult | null> {
  const service = new AliExpressService();
  try {
    return await service.search({ ...filters, query: resolvedQuery });
  } catch (err) {
    console.warn("scrape search failed", resolvedQuery, err);
    return null;
  }
}

async function fetchPoolForKeyword(
  env: Env,
  filters: ProductSearchFilters,
  keyword: string,
  hasToken: boolean,
): Promise<{ pool: AliExpressListing[]; scrape: AliExpressSearchResult | null }> {
  const fetchPages = filters.fetchPages ?? 4;

  const [apiPool, scrapeResult] = await Promise.all([
    hasToken
      ? fetchApiListings(env, keyword, fetchPages, filters.currency).catch(
          () => [] as AliExpressListing[],
        )
      : Promise.resolve([] as AliExpressListing[]),
    fetchScrapeListings(filters, keyword),
  ]);

  const scrapePool =
    scrapeResult?.resultsBeforeFilter ?? scrapeResult?.results ?? [];
  const pool = mergeListings(scrapePool, apiPool);

  return { pool, scrape: scrapeResult };
}

async function fetchWithKeywordFallback(
  env: Env,
  filters: ProductSearchFilters,
  resolved: ReturnType<typeof resolveSearchQuery>,
  hasToken: boolean,
): Promise<{
  pool: AliExpressListing[];
  scrapeResult: AliExpressSearchResult | null;
  keywordsTried: string[];
  keywordFallbackUsed: boolean;
}> {
  const keywords = buildSearchKeywordChain(
    resolved.query,
    resolved.categoryId,
    KEYWORD_FALLBACK_LIMIT,
  );

  let pool: AliExpressListing[] = [];
  let scrapeResult: AliExpressSearchResult | null = null;
  let keywordFallbackUsed = false;

  for (let i = 0; i < keywords.length; i += 1) {
    const keyword = keywords[i]!;
    const result = await fetchPoolForKeyword(env, filters, keyword, hasToken);

    if (!scrapeResult && result.scrape) scrapeResult = result.scrape;
    pool = mergeListings(pool, result.pool);

    if (i > 0) keywordFallbackUsed = true;
    if (pool.length >= MIN_POOL_BEFORE_FALLBACK) break;
  }

  // Retry primary query in English locale if Arabic scrape returned nothing
  if (pool.length < 6 && filters.locale !== "en") {
    const enFilters = { ...filters, locale: "en" as const };
    const enResult = await fetchPoolForKeyword(
      env,
      enFilters,
      resolved.query,
      hasToken,
    );
    if (!scrapeResult && enResult.scrape) scrapeResult = enResult.scrape;
    const before = pool.length;
    pool = mergeListings(pool, enResult.pool);
    if (pool.length > before) keywordFallbackUsed = true;
  }

  return { pool, scrapeResult, keywordsTried: keywords, keywordFallbackUsed };
}

function buildSearchShell(
  resolved: ReturnType<typeof resolveSearchQuery>,
  normalized: ProductSearchFilters,
  fetchPages: number,
  scrape: AliExpressSearchResult | null,
  source: HybridSearchMeta["source"],
): Omit<
  AliExpressSearchResult,
  "results" | "resultsBeforeFilter" | "totalParsed" | "totalAfterFilter"
> {
  const service = new AliExpressService();
  const searchUrl =
    scrape?.searchUrl ?? service.buildSearchUrl(normalized, { minimal: true });

  return {
    query: resolved.query,
    page: normalized.page!,
    searchUrl,
    searchUrlUsed: scrape?.searchUrlUsed ?? searchUrl,
    filtersApplied: {
      ...normalized,
      categoryLabelAr: resolved.categoryLabelAr,
      freeTextQuery: (normalized.query ?? "").trim() || null,
      fetchPages,
      searchSource: source,
    },
    warning: scrape?.warning,
    usedFallbackUrl: scrape?.usedFallbackUrl,
  };
}

function finalizeResults(
  pool: AliExpressListing[],
  ranked: AliExpressListing[],
  normalized: ProductSearchFilters,
  resolved: ReturnType<typeof resolveSearchQuery>,
): AliExpressListing[] {
  const service = new AliExpressService();

  if (normalized.filterMode === "off") {
    return ranked.slice(0, MAX_RESULTS_DISPLAY);
  }

  const filtered = service.refilterListings(ranked, normalized);

  // Always return results when we have a pool — user filters manually afterward
  if (filtered.length > 0) {
    return filtered.slice(0, MAX_RESULTS_DISPLAY);
  }

  return ranked.slice(0, MAX_RESULTS_DISPLAY);
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
  const fetchPages = normalized.fetchPages ?? 4;

  const { pool, scrapeResult, keywordsTried, keywordFallbackUsed } =
    await fetchWithKeywordFallback(env, normalized, resolved, hasToken);

  if (pool.length === 0) {
    throw new HttpError(
      502,
      hasToken
        ? "لم نجد منتجات — جرّب اختيار فئة من القائمة أو كلمة بحث أخرى"
        : "لم نجد منتجات — اربط AliExpress API أو جرّب كلمة أخرى",
    );
  }

  const scrapePool =
    scrapeResult?.resultsBeforeFilter ?? scrapeResult?.results ?? [];
  const ranked = rankByImpressiveness(pool, resolved.query);
  const results = finalizeResults(pool, ranked, normalized, resolved);

  const enrichTarget = results.slice(0, 16);
  let enrichedCount = 0;
  if (hasToken && enrichTarget.length) {
    const enrichedRaw = await enrichListingsFromApi(env, enrichTarget, {
      limit: 16,
      concurrency: 4,
    });
    const enriched = Array.isArray(enrichedRaw) ? enrichedRaw : enrichTarget;
    const enrichedMap = new Map(enriched.map((l) => [l.aliexpressId, l]));
    for (let i = 0; i < results.length; i += 1) {
      const hit = enrichedMap.get(results[i]!.aliexpressId);
      if (hit) results[i] = hit;
    }
    enrichedCount = enriched.filter((l) =>
      l.enrichmentSources?.includes("api"),
    ).length;
  }

  const apiMerged = Math.max(0, pool.length - scrapePool.length);
  const source: HybridSearchMeta["source"] =
    apiMerged > 0 && scrapePool.length > 0
      ? "hybrid"
      : apiMerged > 0
        ? "api"
        : "scraping";

  let warning = scrapeResult?.warning;
  if (keywordFallbackUsed) {
    warning = `بحثنا ${keywordsTried.length} كلمات — ${pool.length} منتج (${results.length} معروض)`;
  } else if (source === "api" && scrapePool.length === 0) {
    warning =
      "بحث API (منتجات رائجة) — للنتائج الأدق اختر فئة + كلمة بحث معاً";
  } else if (source === "scraping" && apiMerged === 0 && hasToken) {
    warning =
      warning ??
      "البحث عبر الموقع — API لم يُرجع نتائج إضافية لهذه الكلمة";
  } else if (source === "hybrid") {
    warning = `دمجنا ${scrapePool.length} من البحث + ${apiMerged} من API الرسمي · ${results.length} معروض`;
    if (enrichedCount > 0) warning += ` · ${enrichedCount} مُثرى`;
  } else {
    warning = `${results.length} منتج مرتّب حسب الإبهار — رتّب/فلتر يدويًا بعد العرض`;
    if (enrichedCount > 0) warning += ` · ${enrichedCount} مُثرى`;
  }

  const shell = buildSearchShell(
    resolved,
    normalized,
    fetchPages,
    scrapeResult,
    source,
  );

  return {
    ...shell,
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
      scrapeCount: scrapePool.length,
      keywordsTried,
      keywordFallbackUsed,
    },
  };
}

/**
 * Hybrid search — scrape (keyword) + API feed merged, enriched when token exists.
 * Multi-keyword fallback ensures results even when primary query is empty/blocked.
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

/** Keyword search for auto-discover — API + scrape fallback per keyword. */
export async function searchListingsForKeyword(
  env: Env,
  keyword: string,
  options: {
    fetchPages: number;
    currency: string;
    enrichLimit?: number;
  },
): Promise<AliExpressListing[]> {
  const hasToken = await hasAliExpressAccessToken(env);
  let listings: AliExpressListing[] = [];

  if (hasToken) {
    listings = await fetchApiListings(
      env,
      keyword,
      options.fetchPages,
      options.currency,
    ).catch(() => []);
  }

  if (listings.length < 6) {
    const scrape = await fetchScrapeListings(
      {
        query: keyword,
        page: 1,
        locale: "ar",
        sort: "orders",
        filterMode: "off",
        applyUrlFilters: false,
        fetchPages: Math.min(options.fetchPages, 6),
        currency: options.currency,
        shipToCountry: "SA",
        discoveryMode: false,
      },
      keyword,
    );
    const scrapeItems = scrape?.resultsBeforeFilter ?? scrape?.results ?? [];
    listings = mergeListings(scrapeItems, listings);
  }

  // English locale fallback for blocked Arabic pages
  if (listings.length < 4) {
    const enScrape = await fetchScrapeListings(
      {
        query: keyword,
        page: 1,
        locale: "en",
        sort: "orders",
        filterMode: "off",
        applyUrlFilters: false,
        fetchPages: Math.min(options.fetchPages, 4),
        currency: options.currency,
        shipToCountry: "SA",
        discoveryMode: false,
      },
      keyword,
    );
    const enItems = enScrape?.resultsBeforeFilter ?? enScrape?.results ?? [];
    listings = mergeListings(enItems, listings);
  }

  const enrichLimit = options.enrichLimit ?? 0;
  if (hasToken && enrichLimit > 0 && listings.length) {
    listings = await enrichListingsFromApi(env, listings, {
      limit: enrichLimit,
      concurrency: 3,
    });
  }

  return listings;
}
