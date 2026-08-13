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
};

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
    filterMode:
      filters.filterMode ?? (filters.presetGrade ? "soft" : "strict"),
    applyUrlFilters:
      filters.applyUrlFilters ?? (filters.presetGrade ? false : true),
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
      pages: Math.min(fetchPages + 2, 6),
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
    console.warn("scrape search failed", err);
    return null;
  }
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
  const fetchPages = Math.min(
    Math.max(normalized.fetchPages ?? (normalized.presetGrade ? 2 : 3), 1),
    8,
  );

  const [apiPool, scrapeResult] = await Promise.all([
    hasToken
      ? fetchApiListings(env, resolved.query, fetchPages, normalized.currency).catch(
          (err) => {
            console.warn("API feed search failed", err);
            return [] as AliExpressListing[];
          },
        )
      : Promise.resolve([] as AliExpressListing[]),
    fetchScrapeListings(normalized, resolved.query),
  ]);

  const scrapePool =
    scrapeResult?.resultsBeforeFilter ?? scrapeResult?.results ?? [];
  const pool = mergeListings(scrapePool, apiPool);

  if (pool.length === 0) {
    throw new HttpError(
      502,
      hasToken
        ? "لم نجد منتجات — جرّب اختيار فئة من القائمة أو كلمة بحث أخرى"
        : "لم نجد منتجات — اربط AliExpress API أو جرّب كلمة أخرى",
    );
  }

  const service = new AliExpressService();
  const ranked = rankByImpressiveness(pool, resolved.query);
  let results = service.refilterListings(ranked, normalized);

  const enrichTarget = (results.length ? results : ranked).slice(0, 12);
  let enrichedCount = 0;
  if (hasToken && enrichTarget.length) {
    const enrichedRaw = await enrichListingsFromApi(env, enrichTarget, {
      limit: 12,
      concurrency: 3,
    });
    const enriched = Array.isArray(enrichedRaw) ? enrichedRaw : enrichTarget;
    const enrichedMap = new Map(enriched.map((l) => [l.aliexpressId, l]));
    results = results.map((l) => enrichedMap.get(l.aliexpressId) ?? l);
    enrichedCount = enriched.filter((l) =>
      l.enrichmentSources?.includes("api"),
    ).length;
  }

  const apiMerged = Math.max(0, pool.length - scrapePool.length);
  const source: HybridSearchMeta["source"] =
    apiPool.length && scrapePool.length
      ? "hybrid"
      : apiPool.length
        ? "api"
        : "scraping";

  let warning = scrapeResult?.warning;
  if (source === "api" && scrapePool.length === 0) {
    warning =
      "بحث API (منتجات رائجة) — للنتائج الأدق اختر فئة + كلمة بحث معاً";
  } else if (source === "scraping" && apiPool.length === 0 && hasToken) {
    warning =
      warning ??
      "البحث عبر الموقع — API لم يُرجع نتائج إضافية لهذه الكلمة";
  } else if (source === "hybrid") {
    warning = `دمجنا ${scrapePool.length} من البحث + ${apiMerged} من API الرسمي`;
    if (enrichedCount > 0) warning += ` · ${enrichedCount} مُثرى`;
  } else if (enrichedCount > 0) {
    warning = `${results.length} منتج · ${enrichedCount} مُثرى بالتفاصيل`;
  }

  const shell = buildSearchShell(
    resolved,
    normalized,
    fetchPages,
    scrapeResult,
    source,
  );

  if (pool.length > 0 && results.length === 0) {
    const top = ranked.slice(0, Math.min(24, ranked.length));
    return {
      ...shell,
      results: top,
      resultsBeforeFilter: pool,
      totalParsed: pool.length,
      totalAfterFilter: top.length,
      warning:
        warning ??
        "الفلاتر شديدة — عرضنا أفضل المنتجات المرتبة بدون فلتر صارم",
      apiMerged,
      enrichedCount,
      meta: {
        source,
        apiEnrichmentAvailable: hasToken,
        apiMerged,
        enrichedCount,
        scrapeCount: scrapePool.length,
      },
    };
  }

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
    },
  };
}

/**
 * Hybrid search — scrape (keyword) + API feed merged, enriched when token exists.
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
        fetchPages: Math.min(options.fetchPages, 3),
        currency: options.currency,
        shipToCountry: "SA",
        discoveryMode: true,
      },
      keyword,
    );
    const scrapeItems = scrape?.resultsBeforeFilter ?? scrape?.results ?? [];
    listings = mergeListings(scrapeItems, listings);
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
