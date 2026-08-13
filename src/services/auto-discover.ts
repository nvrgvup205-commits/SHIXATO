import { findCategory } from "../data/categories";
import type { AliExpressListing, Env } from "../types";
import { HttpError } from "../utils/http";
import { deepSearchPool, resolveDiscoverKeywords } from "./deep-search";
import {
  hasAliExpressAccessToken,
} from "./aliexpress-credentials";
import { enrichListingsFromApi } from "./listing-enricher";
import { KeywordGeneratorService, type KeywordSource } from "./keyword-generator";
import {
  computeWowHeuristic,
  explainWowReject,
  wowToDisplayScore,
} from "./wow-scoring";

export interface ScoredDiscoverListing extends AliExpressListing {
  wowScore: number;
  wowStopReasonAr?: string;
  wowProblemAr?: string;
  wowFlags?: string[];
  matchedKeyword: string;
  discoverFinalScore: number;
  discoverRejected?: boolean;
  discoverRejectReason?: string;
}

export interface AutoDiscoverOptions {
  category: string;
  shipToCountry?: string;
  currency?: string;
  keywordLimit?: number;
  fetchPages?: number;
  turbo?: boolean;
  minWow?: number;
  maxResults?: number;
  fallbackMinWow?: number;
  requireProblemSolving?: boolean;
  env?: Env;
}

export interface WowScoreStats {
  maxWow: number;
  medianWow: number;
  countAtLeast8: number;
  countAtLeast7: number;
}

export interface AutoDiscoverResult {
  categoryId: string;
  categoryLabelAr?: string;
  keywordsUsed: string[];
  keywordSource?: KeywordSource;
  keywordsScanned: number;
  pagesPerKeyword: number;
  turbo: boolean;
  apiListingsMerged?: number;
  totalRaw: number;
  totalUnique: number;
  totalPassedGate: number;
  minWowUsed: number;
  discoverMode: "wow";
  executionTimeSeconds: number;
  wowStats: WowScoreStats;
  results: ScoredDiscoverListing[];
  rejectedResults: ScoredDiscoverListing[];
  resultsBeforeFilter?: AliExpressListing[];
  warning?: string;
  errors: Array<{ keyword: string; message: string }>;
}

function computeWowStats(scores: number[]): WowScoreStats {
  if (!scores.length) {
    return { maxWow: 0, medianWow: 0, countAtLeast8: 0, countAtLeast7: 0 };
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
      : sorted[mid]!;
  return {
    maxWow: sorted[sorted.length - 1]!,
    medianWow: median,
    countAtLeast8: scores.filter((s) => s >= 8).length,
    countAtLeast7: scores.filter((s) => s >= 7).length,
  };
}

function buildScoredListing(
  item: AliExpressListing,
  keyword: string,
  wowScore: number,
  flags: string[],
): ScoredDiscoverListing {
  return {
    ...item,
    wowScore,
    wowFlags: flags,
    matchedKeyword: keyword,
    discoverFinalScore: wowToDisplayScore(wowScore),
    discoveryScore: wowToDisplayScore(wowScore),
    aiScore: wowToDisplayScore(wowScore),
  };
}

function scorePool(
  pool: AliExpressListing[],
  primaryKeyword: string,
): ScoredDiscoverListing[] {
  return pool.map((item) => {
    const heuristic = computeWowHeuristic(item, primaryKeyword);
    if (heuristic.flags.includes("مرفوض")) {
      return buildScoredListing(item, primaryKeyword, 1, heuristic.flags);
    }
    return buildScoredListing(item, primaryKeyword, heuristic.wowScore, heuristic.flags);
  });
}

async function resolveKeywords(
  env: Env | undefined,
  categoryId: string,
  limit: number,
): Promise<{ keywords: string[]; source: KeywordSource }> {
  const curated = resolveDiscoverKeywords(categoryId, limit);
  if (curated.length >= 6) {
    return { keywords: curated.slice(0, limit), source: "file" };
  }

  if (env) {
    const kw = await new KeywordGeneratorService(env).forCategory(categoryId, limit);
    if (kw.keywords.length >= 4) {
      return { keywords: kw.keywords, source: kw.source };
    }
  }

  return { keywords: curated, source: "generated" };
}

/**
 * Fast deep discovery — parallel keyword batches, curated keywords first, all results shown.
 */
export class AutoDiscoverService {
  async discover(options: AutoDiscoverOptions): Promise<AutoDiscoverResult> {
    const start = Date.now();
    const categoryId = options.category?.trim();
    if (!categoryId) throw new HttpError(400, "اختر الفئة أولًا");

    const cat = findCategory(categoryId);
    if (!cat) throw new HttpError(400, "فئة غير معروفة: " + categoryId);

    const turbo = options.turbo !== false;
    const keywordLimit = Math.min(
      Math.max(options.keywordLimit ?? (turbo ? 8 : 5), 4),
      10,
    );
    const fetchPages = Math.min(
      Math.max(options.fetchPages ?? (turbo ? 3 : 2), 1),
      6,
    );
    const minWow = options.minWow ?? 3;
    const maxResults = Math.min(Math.max(options.maxResults ?? (turbo ? 96 : 72), 24), 120);

    if (!options.env) {
      throw new HttpError(502, "بيئة التشغيل غير متاحة");
    }

    const { keywords, source: keywordSource } = await resolveKeywords(
      options.env,
      categoryId,
      keywordLimit,
    );

    if (keywords.length < 2) {
      throw new HttpError(502, "تعذّر توليد كلمات بحث للفئة");
    }

    const currency = (options.currency || "USD").toUpperCase();
    const shipTo = (options.shipToCountry || "SA").toUpperCase();

    const deep = await deepSearchPool(options.env, {
      categoryId,
      primaryQuery: cat.query,
      extraKeywords: keywords.filter((k) => k !== cat.query),
      fetchPages,
      maxKeywords: keywordLimit,
      parallelBatch: turbo ? 4 : 3,
      targetPoolSize: turbo ? 96 : 72,
      currency,
      shipToCountry: shipTo,
      locale: "ar",
    });

    const primaryKeyword = keywords[0] ?? cat.query;
    let all = scorePool(deep.pool, primaryKeyword).sort(
      (a, b) => b.wowScore - a.wowScore,
    );

    const wowStats = computeWowStats(all.map((x) => x.wowScore));
    const minWowUsed = minWow;

    const impressive = all.filter((x) => x.wowScore >= minWowUsed);
    const lowWow = all.filter((x) => x.wowScore < minWowUsed);

    let results = all.slice(0, maxResults).map((item) => ({
      ...item,
      discoverRejected: item.wowScore < minWowUsed,
      discoverRejectReason:
        item.wowScore < minWowUsed
          ? explainWowReject(item.wowScore, item.wowFlags ?? [], minWowUsed)
          : undefined,
    }));

    if (options.env && results.length) {
      results = await enrichListingsFromApi(options.env, results, {
        limit: Math.min(results.length, 24),
        concurrency: 4,
      });
    }

    const resultIds = new Set(results.map((r) => r.aliexpressId));
    const rejectedResults = [
      ...lowWow.filter((x) => !resultIds.has(x.aliexpressId)),
      ...impressive.filter((x) => !resultIds.has(x.aliexpressId)),
    ]
      .slice(0, 60)
      .map((item) => ({
        ...item,
        discoverRejected: true,
        discoverRejectReason: explainWowReject(
          item.wowScore,
          item.wowFlags ?? [],
          minWowUsed,
        ),
      }));

    let warning: string | undefined;
    if (!results.length) {
      const errHint = deep.errors.length
        ? ` · أخطاء: ${deep.errors.slice(0, 2).join("; ")}`
        : "";
      warning =
        `لم نجد منتجات — جرّب فئة أخرى أو اربط AliExpress API${errHint}`;
    } else {
      warning =
        `${results.length} منتج من ${deep.keywordsTried.length} كلمات` +
        ` · ${deep.pool.length} خام` +
        (deep.stoppedEarly ? " · توقّف مبكرًا" : "") +
        (impressive.length ? ` · ${impressive.length} مبهر (≥${minWowUsed})` : "");
      if (await hasAliExpressAccessToken(options.env)) {
        warning += ` · ${deep.apiCount} من API`;
      }
    }

    return {
      categoryId,
      categoryLabelAr: cat.labelAr,
      keywordsUsed: deep.keywordsTried,
      keywordSource,
      keywordsScanned: deep.keywordsTried.length,
      pagesPerKeyword: fetchPages,
      turbo,
      apiListingsMerged: deep.apiCount,
      totalRaw: deep.scrapeCount + deep.apiCount,
      totalUnique: all.length,
      totalPassedGate: impressive.length,
      minWowUsed,
      discoverMode: "wow",
      executionTimeSeconds: Math.round((Date.now() - start) / 100) / 10,
      wowStats,
      results,
      rejectedResults,
      resultsBeforeFilter: deep.pool,
      warning,
      errors: deep.errors.map((message) => ({ keyword: "", message })),
    };
  }
}
