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
  passesImpressiveGate,
  type DiscoverScoreBreakdown,
} from "./discover-scoring";
import { KeywordGeneratorService, type KeywordSource } from "./keyword-generator";

export interface ScoredDiscoverListing extends AliExpressListing {
  discoverFinalScore: number;
  discoverBreakdown: DiscoverScoreBreakdown;
  matchedKeyword: string;
}

export interface AutoDiscoverOptions {
  category: string;
  shipToCountry?: string;
  currency?: string;
  /** How many keywords to scan (default 15, max 20) */
  keywordLimit?: number;
  /** Minimum final score (default 75) */
  minScore?: number;
  /** Max products returned (default 12) */
  maxResults?: number;
  /** Fallback min score if too few pass primary cutoff (default 70) */
  fallbackMinScore?: number;
  env?: Env;
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
  results: ScoredDiscoverListing[];
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

/**
 * Multi-keyword automated discovery — searches many specific queries,
 * merges, scores strictly, returns only impressive products.
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
    const minScore = options.minScore ?? 75;
    const fallbackMinScore = options.fallbackMinScore ?? 70;
    const maxResults = Math.min(Math.max(options.maxResults ?? 12, 3), 20);

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
          fetchPages: 1,
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
          const breakdown = computeDiscoverScore(item, { targetYear: CURRENT_YEAR });
          const scored: ScoredDiscoverListing = {
            ...item,
            discoverFinalScore: breakdown.finalScore,
            discoverBreakdown: breakdown,
            matchedKeyword: keyword,
            discoveryScore: item.discoveryScore ?? breakdown.finalScore,
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

    const all = [...byId.values()];
    let minScoreUsed = minScore;
    let passed = all
      .filter((item) => passesImpressiveGate(item, minScore, CURRENT_YEAR))
      .sort((a, b) => b.discoverFinalScore - a.discoverFinalScore);

    if (passed.length < 2) {
      minScoreUsed = fallbackMinScore;
      passed = all
        .filter((item) => passesImpressiveGate(item, fallbackMinScore, CURRENT_YEAR))
        .sort((a, b) => b.discoverFinalScore - a.discoverFinalScore);
    }

    const results = passed.slice(0, maxResults);

    let warning: string | undefined;
    if (!results.length) {
      warning =
        "ما لقينا منتجات بscore " + minScore + "+ — جرّب فئة أخرى أو أعد المحاولة لاحقًا";
    } else if (minScoreUsed < minScore) {
      warning =
        `يوم أضعف — عرضنا أفضل ${results.length} منتج (score ≥ ${minScoreUsed}) بدل ${minScore}`;
    } else if (results.length < 5) {
      warning = `وجدنا ${results.length} منتج ممتاز فقط — الجودة أهم من العدد`;
    }

    const executionTimeSeconds =
      Math.round((Date.now() - start) / 100) / 10;

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
      results,
      warning,
      errors,
    };
  }
}
