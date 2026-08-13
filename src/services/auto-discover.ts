import { findCategory } from "../data/categories";
import { DISCOVERY_EXCLUDES } from "../data/dropship-presets";
import type { AliExpressListing, Env } from "../types";
import { HttpError } from "../utils/http";
import {
  delayBeforeRequest,
  delayBetweenKeywordSearches,
} from "../utils/rate-limiter";
import { mapApiSearchProductToListing } from "./api-listing-mapper";
import { AliExpressApi } from "./aliexpress-api";
import {
  hasAliExpressAccessToken,
} from "./aliexpress-credentials";
import { searchListingsForKeyword } from "./hybrid-search";
import { KeywordGeneratorService, type KeywordSource } from "./keyword-generator";
import { WowAnalyzerService } from "./wow-analyzer";
import {
  computeWowHeuristic,
  explainWowReject,
  pickImpressiveWowResults,
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
  /** Pages per keyword (default 6 turbo / 3 standard, max 8) */
  fetchPages?: number;
  /** Turbo: 20 keywords × many pages + problem-solving focus */
  turbo?: boolean;
  /** Minimum wow 1–10 (default 7) */
  minWow?: number;
  maxResults?: number;
  fallbackMinWow?: number;
  /** When true, skip listings without clear problem-solving signal */
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

function ingestListing(
  byId: Map<string, ScoredDiscoverListing>,
  item: AliExpressListing,
  keyword: string,
  requireProblemSolving: boolean,
): void {
  const heuristic = computeWowHeuristic(item, keyword);
  if (heuristic.flags.includes("مرفوض")) return;

  let wowScore = heuristic.wowScore;
  if (requireProblemSolving && heuristic.problemClarity >= 7) {
    wowScore = Math.min(10, wowScore + 1);
  }

  const scored = buildScoredListing(item, keyword, wowScore, heuristic.flags);
  const existing = byId.get(item.aliexpressId);
  if (!existing || scored.wowScore > existing.wowScore) {
    byId.set(item.aliexpressId, scored);
  }
}

async function mergeOfficialApiPool(
  env: Env,
  turbo: boolean,
  currency: string,
  keywords: string[],
  byId: Map<string, ScoredDiscoverListing>,
  requireProblemSolving: boolean,
): Promise<number> {
  if (!(await hasAliExpressAccessToken(env))) return 0;

  try {
    const api = await AliExpressApi.fromEnv(env);
    const rows = await api.fetchRecommendFeed({
      pages: turbo ? 6 : 4,
      pageSize: 50,
      strictKeyword: false,
    });

    let merged = 0;
    for (const row of rows) {
      const listing = mapApiSearchProductToListing(row, currency);
      const keyword =
        keywords.find((kw) =>
          listing.title.toLowerCase().includes(kw.toLowerCase().split(/\s+/)[0] ?? ""),
        ) ?? "api-bestseller";
      const before = byId.size;
      ingestListing(byId, listing, keyword, requireProblemSolving);
      if (byId.size > before) merged += 1;
    }
    return merged;
  } catch {
    return 0;
  }
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

    const turbo = options.turbo !== false;
    const keywordLimit = Math.min(
      Math.max(options.keywordLimit ?? (turbo ? 20 : 15), 10),
      20,
    );
    const fetchPages = Math.min(
      Math.max(options.fetchPages ?? (turbo ? 6 : 3), 1),
      8,
    );
    const requireProblemSolving = options.requireProblemSolving ?? false;
    const minWow = options.minWow ?? (turbo ? 6 : 7);
    const fallbackMinWow = options.fallbackMinWow ?? 5;
    const maxResults = Math.min(Math.max(options.maxResults ?? 12, 6), 24);

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
    let apiListingsMerged = 0;

    if (options.env) {
      apiListingsMerged = await mergeOfficialApiPool(
        options.env,
        turbo,
        currency,
        keywords,
        byId,
        requireProblemSolving,
      );
      totalRaw += apiListingsMerged;
    }

    for (let i = 0; i < keywords.length; i += 1) {
      const keyword = keywords[i]!;

      if (i > 0) {
        await delayBetweenKeywordSearches();
      }

      try {
        await delayBeforeRequest();

        if (!options.env) continue;

        const items = await searchListingsForKeyword(options.env, keyword, {
          fetchPages,
          currency,
          enrichLimit: turbo ? 16 : 12,
        });
        totalRaw += items.length;
        scanned += 1;

        for (const item of items) {
          ingestListing(byId, item, keyword, requireProblemSolving);
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

    const picked = pickImpressiveWowResults(all, maxResults, minWow, fallbackMinWow);
    const minWowUsed = picked.minWowUsed;
    const passed = all.filter((item) => item.wowScore >= minWowUsed);

    const results = picked.results.map((item) => ({
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
        `لم نجد منتجات بعد ${scanned} كلمات — جرّب فئة أخرى أو أعد المحاولة`;
    } else if (minWowUsed < minWow) {
      warning = `عرضنا أفضل ${results.length} منتج (إبهار ≥ ${minWowUsed}/10)`;
    } else if (apiListingsMerged > 0) {
      warning = `دمجنا ${apiListingsMerged} منتج إضافي من API الرسمي`;
    } else if (results.length < 5) {
      warning = `${results.length} منتج يثبت — راجع المُتجاهَل للمزيد`;
    }

    const executionTimeSeconds = Math.round((Date.now() - start) / 100) / 10;

    return {
      categoryId,
      categoryLabelAr: cat.labelAr,
      keywordsUsed: keywords,
      keywordSource,
      keywordsScanned: scanned,
      pagesPerKeyword: fetchPages,
      turbo,
      apiListingsMerged,
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
