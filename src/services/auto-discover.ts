import { findCategory } from "../data/categories";
import { DISCOVERY_EXCLUDES } from "../data/dropship-presets";
import type { AliExpressListing, Env, ProductSearchFilters } from "../types";
import { HttpError } from "../utils/http";
import {
  delayBeforeRequest,
  delayBetweenKeywordSearches,
} from "../utils/rate-limiter";
import { AliExpressService } from "./aliexpress";
import { KeywordGeneratorService, type KeywordSource } from "./keyword-generator";
import { WowAnalyzerService } from "./wow-analyzer";
import {
  computeWowHeuristic,
  explainWowReject,
  passesWowGate,
  wowToDisplayScore,
} from "./wow-scoring";

export interface ScoredDiscoverListing extends AliExpressListing {
  /** إبهار 1–10 — الهدف الأساسي */
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
  /** Minimum wow 1–10 (default 7) */
  minWow?: number;
  maxResults?: number;
  fallbackMinWow?: number;
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
  totalRaw: number;
  totalUnique: number;
  totalPassedGate: number;
  minWowUsed: number;
  discoverMode: "wow";
  executionTimeSeconds: number;
  wowStats: WowScoreStats;
  results: ScoredDiscoverListing[];
  /** Top scored items that did not pass the pick threshold */
  rejectedResults: ScoredDiscoverListing[];
  warning?: string;
  errors: Array<{ keyword: string; message: string }>;
}

const CURRENT_YEAR = new Date().getUTCFullYear();

function isRateLimitError(err: unknown): boolean {
  if (err instanceof HttpError) {
    const status = err.status;
    const details = err.details as { status?: number } | undefined;
    return status === 429 || status === 403 || details?.status === 429 || details?.status === 403;
  }
  if (err instanceof Error) {
    return /429|403|blocked|timeout|abort/i.test(err.message);
  }
  return false;
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
  insight?: { stopReasonAr?: string; problemAr?: string },
): ScoredDiscoverListing {
  return {
    ...item,
    wowScore,
    wowFlags: flags,
    wowStopReasonAr: insight?.stopReasonAr,
    wowProblemAr: insight?.problemAr,
    matchedKeyword: keyword,
    discoverFinalScore: wowToDisplayScore(wowScore),
    discoveryScore: wowToDisplayScore(wowScore),
    aiScore: wowToDisplayScore(wowScore),
    hookAr: insight?.stopReasonAr || item.hookAr,
  };
}

/**
 * Multi-keyword discovery — merges many searches, ranks all, returns picks + rejected preview.
 */
export class AutoDiscoverService {
  private aliexpress = new AliExpressService();

  async discover(options: AutoDiscoverOptions): Promise<AutoDiscoverResult> {
    const start = Date.now();
    const categoryId = options.category?.trim();
    if (!categoryId) {
      throw new HttpError(400, "اختر الفئة أولًا");
    }

    const cat = findCategory(categoryId);
    if (!cat) {
      throw new HttpError(400, "فئة غير معروفة: " + categoryId);
    }

    const keywordLimit = Math.min(Math.max(options.keywordLimit ?? 15, 10), 20);
    const minWow = options.minWow ?? 7;
    const fallbackMinWow = options.fallbackMinWow ?? 6;
    const maxResults = Math.min(Math.max(options.maxResults ?? 12, 3), 24);

    let keywords: string[] = [];
    let keywordSource: KeywordSource = "generated";

    if (options.env) {
      const kw = await new KeywordGeneratorService(options.env).forCategory(
        categoryId,
        keywordLimit,
      );
      keywords = kw.keywords;
      keywordSource = kw.source;
    }

    if (keywords.length < 8) {
      throw new HttpError(
        502,
        "تعذّر توليد كلمات بحث — تأكد من تفعيل Workers AI في wrangler.toml",
      );
    }

    const shipTo = (options.shipToCountry || "SA").toUpperCase();
    const currency = (options.currency || "USD").toUpperCase();

    const byId = new Map<string, ScoredDiscoverListing>();
    const errors: AutoDiscoverResult["errors"] = [];
    let totalRaw = 0;
    let scanned = 0;

    for (let i = 0; i < keywords.length; i += 1) {
      const keyword = keywords[i]!;

      if (i > 0) {
        await delayBetweenKeywordSearches();
      }

      try {
        await delayBeforeRequest();

        const filters: ProductSearchFilters = {
          query: keyword,
          category: categoryId,
          page: 1,
          locale: "ar",
          sort: "orders",
          filterMode: "off",
          applyUrlFilters: false,
          fetchPages: 2,
          currency,
          shipToCountry: shipTo,
          discoveryMode: true,
          minLaunchYear: CURRENT_YEAR,
          excludeKeywords: DISCOVERY_EXCLUDES,
        };

        const batch = await this.aliexpress.search(filters);
        const items = batch.resultsBeforeFilter ?? batch.results;
        totalRaw += items.length;
        scanned += 1;

        for (const item of items) {
          const heuristic = computeWowHeuristic(item, keyword);
          if (heuristic.flags.includes("مرفوض")) continue;

          const scored = buildScoredListing(
            item,
            keyword,
            heuristic.wowScore,
            heuristic.flags,
          );

          const existing = byId.get(item.aliexpressId);
          if (!existing || scored.wowScore > existing.wowScore) {
            byId.set(item.aliexpressId, scored);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "فشل البحث";
        errors.push({ keyword, message });

        if (isRateLimitError(err)) {
          throw new HttpError(
            429,
            "AliExpress حظر مؤقت — انتظر دقيقة ثم أعد الاكتشاف التلقائي",
            { keyword, partialResults: byId.size },
          );
        }
      }
    }

    let all = [...byId.values()].sort((a, b) => b.wowScore - a.wowScore);

    // AI wow batch on top heuristic candidates (1 call — cheap)
    if (options.env?.AI && all.length > 0) {
      const candidates = all.slice(0, 22);
      const insights = await new WowAnalyzerService(options.env).analyzeBatch(
        candidates,
        cat.labelAr,
        minWow,
      );

      all = all.map((item) => {
        const insight = insights.get(item.aliexpressId.replace(/\D/g, ""));
        if (!insight) return item;

        const blended = Math.round(
          insight.wowScore * 0.65 + item.wowScore * 0.35,
        );
        const finalWow = Math.max(1, Math.min(10, blended));
        return buildScoredListing(item, item.matchedKeyword, finalWow, item.wowFlags ?? [], {
          stopReasonAr: insight.stopReasonAr,
          problemAr: insight.problemAr,
        });
      });
      all.sort((a, b) => b.wowScore - a.wowScore);
    }

    const wowStats = computeWowStats(all.map((x) => x.wowScore));

    let minWowUsed = minWow;
    let passed = all.filter((item) => passesWowGate(item.wowScore, minWow));

    if (passed.length < 3) {
      minWowUsed = fallbackMinWow;
      passed = all.filter((item) => passesWowGate(item.wowScore, fallbackMinWow));
    }

    const results = passed.slice(0, maxResults).map((item) => ({
      ...item,
      discoverRejected: false,
    }));

    const resultIds = new Set(results.map((r) => r.aliexpressId));
    const rejectedResults = all
      .filter((item) => !resultIds.has(item.aliexpressId))
      .slice(0, 30)
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
      warning =
        `ما في منتجات إبهار ${minWow}/10+ — أعلى إبهار: ${wowStats.maxWow}/10 — اضغط «عرض المُتجاهَل»`;
    } else if (minWowUsed < minWow) {
      warning = `يوم أضعف — عرضنا ${results.length} منتج (إبهار ≥ ${minWowUsed})`;
    } else if (results.length < 5) {
      warning = `${results.length} منتج يثبت — راجع المُتجاهَل`;
    }

    const executionTimeSeconds = Math.round((Date.now() - start) / 100) / 10;

    return {
      categoryId,
      categoryLabelAr: cat.labelAr,
      keywordsUsed: keywords,
      keywordSource,
      keywordsScanned: scanned,
      totalRaw,
      totalUnique: all.length,
      totalPassedGate: passed.length,
      minWowUsed,
      discoverMode: "wow",
      executionTimeSeconds,
      wowStats,
      results,
      rejectedResults,
      warning,
      errors,
    };
  }
}
