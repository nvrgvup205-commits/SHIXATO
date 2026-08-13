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
};

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

function buildApiSearchShell(
  resolved: ReturnType<typeof resolveSearchQuery>,
  normalized: ProductSearchFilters,
  fetchPages: number,
): Omit<AliExpressSearchResult, "results" | "resultsBeforeFilter" | "totalParsed" | "totalAfterFilter"> {
  const service = new AliExpressService();
  const searchUrl = service.buildSearchUrl(normalized, { minimal: true });
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
      searchSource: "aliexpress_ds_api",
    },
    usedFallbackUrl: false,
  };
}

async function searchViaOfficialApi(
  env: Env,
  filters: ProductSearchFilters,
): Promise<AliExpressSearchResult & { apiMerged?: number; enrichedCount?: number }> {
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

  const api = await AliExpressApi.fromEnv(env);
  const rows = await api.fetchRecommendFeed({
    keyword: resolved.query,
    pages: fetchPages,
    strictKeyword: false,
  });

  let pool = rows.map((row) =>
    mapApiSearchProductToListing(row, normalized.currency),
  );

  if (pool.length < 8 && resolved.query.length >= 2) {
    const broader = await api.fetchRecommendFeed({
      pages: Math.min(fetchPages + 2, 8),
      strictKeyword: false,
    });
    const seen = new Set(pool.map((p) => p.aliexpressId));
    for (const row of broader) {
      const listing = mapApiSearchProductToListing(row, normalized.currency);
      if (!seen.has(listing.aliexpressId)) {
        seen.add(listing.aliexpressId);
        pool.push(listing);
      }
    }
  }

  const service = new AliExpressService();
  const ranked = rankByImpressiveness(pool, resolved.query);
  let results = service.refilterListings(ranked, normalized);

  const enrichTarget = (results.length ? results : ranked).slice(0, 24);
  const enrichedRaw = await enrichListingsFromApi(env, enrichTarget, {
    limit: 24,
    concurrency: 4,
  });
  const enriched = Array.isArray(enrichedRaw) ? enrichedRaw : enrichTarget;
  const enrichedMap = new Map(enriched.map((l) => [l.aliexpressId, l]));
  results = results.map((l) => enrichedMap.get(l.aliexpressId) ?? l);
  pool = pool.map((l) => enrichedMap.get(l.aliexpressId) ?? l);

  const enrichedCount = enriched.filter((l) =>
    l.enrichmentSources?.includes("api"),
  ).length;

  let warning: string | undefined;
  if (pool.length === 0) {
    warning =
      "لم يُرجع API منتجات لهذا البحث — جرّب كلمة أخرى أو فئة مختلفة";
  } else if (results.length === 0) {
    warning =
      `وجدنا ${pool.length} منتجًا من API لكن الفلاتر استبعدتهم — جرّب «عرض بدون فلتر»`;
  } else {
    warning = `بحث عبر API الرسمي — ${results.length} منتج مع تفاصيل كاملة`;
    if (enrichedCount > 0) {
      warning += ` (${enrichedCount} مُثرى بالشحن والتقييمات)`;
    }
  }

  const shell = buildApiSearchShell(resolved, normalized, fetchPages);

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
      apiMerged: pool.length,
      enrichedCount,
    };
  }

  return {
    ...shell,
    results,
    resultsBeforeFilter: pool,
    totalParsed: pool.length,
    totalAfterFilter: results.length,
    warning,
    apiMerged: pool.length,
    enrichedCount,
  };
}

/**
 * API-first when OAuth token exists — scraping only without token or as last resort.
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

  if (hasToken) {
    try {
      const data = await searchViaOfficialApi(env, filters);
      return {
        ...data,
        meta: {
          source: "api",
          apiEnrichmentAvailable: true,
          apiMerged: data.apiMerged,
          enrichedCount: data.enrichedCount,
        },
      };
    } catch (err) {
      if (err instanceof HttpError && err.status < 500) throw err;
      console.warn("API-first search failed", err);
      throw new HttpError(
        502,
        "فشل البحث عبر API الرسمي — تحقق من ربط AliExpress ثم أعد المحاولة",
        { cause: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  const service = new AliExpressService();
  try {
    const base = await service.search(filters);
    return {
      ...base,
      meta: {
        source: "scraping",
        apiEnrichmentAvailable: false,
      },
    };
  } catch (err) {
    if (err instanceof HttpError) {
      throw new HttpError(
        err.status,
        err.message +
          " — اربط AliExpress من الإعدادات لاستخدام API الرسمي بدون حظر",
        err.details,
      );
    }
    throw err;
  }
}

/** Keyword search for auto-discover — API when token exists. */
export async function searchListingsForKeyword(
  env: Env,
  keyword: string,
  options: {
    fetchPages: number;
    currency: string;
    enrichLimit?: number;
  },
): Promise<AliExpressListing[]> {
  if (!(await hasAliExpressAccessToken(env))) {
    const service = new AliExpressService();
    const batch = await service.search({
      query: keyword,
      page: 1,
      locale: "ar",
      sort: "orders",
      filterMode: "off",
      applyUrlFilters: false,
      fetchPages: options.fetchPages,
      currency: options.currency,
      shipToCountry: "SA",
      discoveryMode: true,
    });
    return batch.resultsBeforeFilter ?? batch.results;
  }

  const api = await AliExpressApi.fromEnv(env);
  const rows = await api.fetchRecommendFeed({
    keyword,
    pages: options.fetchPages,
    strictKeyword: false,
  });
  let listings = rows.map((row) =>
    mapApiSearchProductToListing(row, options.currency),
  );
  const enrichLimit = options.enrichLimit ?? 20;
  if (enrichLimit > 0) {
    listings = await enrichListingsFromApi(env, listings, {
      limit: enrichLimit,
      concurrency: 4,
    });
  }
  return listings;
}
