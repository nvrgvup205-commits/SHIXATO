import type { AliExpressListing, AliExpressSearchResult, Env, ProductSearchFilters } from "../types";
import { mapApiSearchProductToListing } from "./api-listing-mapper";
import { AliExpressApi } from "./aliexpress-api";
import { AliExpressService } from "./aliexpress";
import { hasAliExpressAccessToken } from "./aliexpress-credentials";
import { computeWowHeuristic } from "./wow-scoring";

function mergeListings(
  base: AliExpressListing[],
  extra: AliExpressListing[],
): AliExpressListing[] {
  const byId = new Map<string, AliExpressListing>();
  for (const item of base) byId.set(item.aliexpressId, item);
  for (const item of extra) {
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

/**
 * Scrape + official DS API merged search — ranked by impressiveness (wow score).
 */
export async function hybridAliExpressSearch(
  env: Env,
  filters: ProductSearchFilters,
): Promise<AliExpressSearchResult & { apiMerged?: number }> {
  const service = new AliExpressService();
  const base = await service.search(filters);
  let pool = base.resultsBeforeFilter ?? base.results;
  let apiMerged = 0;

  if (await hasAliExpressAccessToken(env)) {
    try {
      const api = await AliExpressApi.fromEnv(env);
      const rows = await api.fetchRecommendFeed({
        keyword: filters.query,
        pages: Math.min(Math.max(filters.fetchPages ?? 2, 1), 6),
        strictKeyword: false,
      });
      const apiListings = rows.map((row) =>
        mapApiSearchProductToListing(row, filters.currency),
      );
      const before = pool.length;
      pool = mergeListings(pool, apiListings);
      apiMerged = pool.length - before;
    } catch {
      // API optional — scraping still works
    }
  }

  const ranked = rankByImpressiveness(pool, filters.query);
  const results = service.refilterListings(ranked, filters);

  let warning = base.warning;
  if (apiMerged > 0) {
    const apiNote = `دمجنا ${apiMerged} منتج من API الرسمي`;
    warning = warning ? `${warning} — ${apiNote}` : apiNote;
  }
  if (pool.length > 0 && results.length === 0) {
    const top = ranked.slice(0, Math.min(24, ranked.length));
    return {
      ...base,
      results: top,
      resultsBeforeFilter: pool,
      totalParsed: pool.length,
      totalAfterFilter: top.length,
      warning:
        warning ??
        "الفلاتر شديدة — عرضنا أفضل المنتجات المرتبة بدون فلتر صارم",
      apiMerged,
    };
  }

  return {
    ...base,
    results,
    resultsBeforeFilter: pool,
    totalParsed: pool.length,
    totalAfterFilter: results.length,
    warning,
    apiMerged,
  };
}
