import { findCategory } from "../data/categories";
import { DISCOVERY_EXCLUDES } from "../data/dropship-presets";
import type { AliExpressListing, Env, ProductSearchFilters } from "../types";
import { HttpError } from "../utils/http";
import {
  delayBeforeRequest,
  delayBetweenKeywordSearches,
} from "../utils/rate-limiter";
import { AliExpressService } from "./aliexpress";
import {
  computeDiscoverScore,
  explainRejectReason,
  passesDiscoverPick,
  type DiscoverScoreBreakdown,
} from "./discover-scoring";
import { KeywordGeneratorService, type KeywordSource } from "./keyword-generator";

export interface ScoredDiscoverListing extends AliExpressListing {
  discoverFinalScore: number;
  discoverBreakdown: DiscoverScoreBreakdown;
  matchedKeyword: string;
  discoverRejected?: boolean;
  discoverRejectReason?: string;
}

export interface AutoDiscoverOptions {
  category: string;
  shipToCountry?: string;
  currency?: string;
  keywordLimit?: number;
  minScore?: number;
  maxResults?: number;
  fallbackMinScore?: number;
  env?: Env;
}

export interface DiscoverScoreStats {
  maxScore: number;
  medianScore: number;
  countAtLeast80: number;
  countAtLeast70: number;
  countAtLeast60: number;
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
  minScoreUsed: number;
  executionTimeSeconds: number;
  scoreStats: DiscoverScoreStats;
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

function computeScoreStats(scores: number[]): DiscoverScoreStats {
  if (!scores.length) {
    return {
      maxScore: 0,
      medianScore: 0,
      countAtLeast80: 0,
      countAtLeast70: 0,
      countAtLeast60: 0,
    };
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
      : sorted[mid]!;

  return {
    maxScore: sorted[sorted.length - 1]!,
    medianScore: median,
    countAtLeast80: scores.filter((s) => s >= 80).length,
    countAtLeast70: scores.filter((s) => s >= 70).length,
    countAtLeast60: scores.filter((s) => s >= 60).length,
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
    const minScore = options.minScore ?? 68;
    const fallbackMinScore = options.fallbackMinScore ?? 60;
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
          const breakdown = computeDiscoverScore(item, {
            targetYear: CURRENT_YEAR,
            matchedKeyword: keyword,
          });
          const scored: ScoredDiscoverListing = {
            ...item,
            discoverFinalScore: breakdown.finalScore,
            discoverBreakdown: breakdown,
            matchedKeyword: keyword,
            discoveryScore: breakdown.finalScore,
            aiScore: breakdown.finalScore,
          };

          const existing = byId.get(item.aliexpressId);
          if (!existing || scored.discoverFinalScore > existing.discoverFinalScore) {
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

    const all = [...byId.values()].sort(
      (a, b) => b.discoverFinalScore - a.discoverFinalScore,
    );
    const scoreStats = computeScoreStats(all.map((x) => x.discoverFinalScore));

    let minScoreUsed = minScore;
    let passed = all.filter((item) =>
      passesDiscoverPick(item, minScore, {
        targetYear: CURRENT_YEAR,
        matchedKeyword: item.matchedKeyword,
      }),
    );

    if (passed.length < 3) {
      minScoreUsed = fallbackMinScore;
      passed = all.filter((item) =>
        passesDiscoverPick(item, fallbackMinScore, {
          targetYear: CURRENT_YEAR,
          matchedKeyword: item.matchedKeyword,
        }),
      );
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
        discoverRejectReason: explainRejectReason(item, minScoreUsed, {
          targetYear: CURRENT_YEAR,
          matchedKeyword: item.matchedKeyword,
        }),
      }));

    let warning: string | undefined;
    if (!results.length) {
      warning =
        `ما في منتجات بscore ${minScore}+ — أعلى score: ${scoreStats.maxScore} · متوسط: ${scoreStats.medianScore} — اضغط «عرض المُتجاهَل»`;
    } else if (minScoreUsed < minScore) {
      warning =
        `يوم أضعف — عرضنا ${results.length} منتج (≥ ${minScoreUsed}) بدل ${minScore}`;
    } else if (results.length < 5) {
      warning = `${results.length} منتج قوي — راجع المُتجاهَل للباقي`;
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
      minScoreUsed,
      executionTimeSeconds,
      scoreStats,
      results,
      rejectedResults,
      warning,
      errors,
    };
  }
}
