import type { AliExpressListing } from "../types";
import {
  computeTrustScore,
  enrichListingQuality,
  heuristicTitleHaystack,
  isGenericTitleInHaystack,
  isProblemSolvingInHaystack,
  isSuspiciousMetrics,
} from "../utils/listing-discovery";

export interface DiscoverScoreBreakdown {
  trust: number;
  problemFit: number;
  margin: number;
  salesCredibility: number;
  ratingQuality: number;
  finalScore: number;
  flags: string[];
}

export interface DiscoverScoreOptions {
  targetMarginPercent?: number;
  targetYear?: number;
  /** Keyword that found this listing — helps score Arabic titles */
  matchedKeyword?: string;
}

const DEFAULT_TARGET_MARGIN = 40;
const TARGET_COST_MAX = 35;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function computeMarginScore(
  listing: AliExpressListing,
  _targetMarginPercent = DEFAULT_TARGET_MARGIN,
): number {
  const cost = listing.originalPrice ?? 0;
  if (cost <= 0) return 15;
  if (cost > 80) return 30;
  if (cost <= TARGET_COST_MAX) return 90;
  if (cost <= 50) return 76;
  return 58;
}

function computeSalesCredibility(listing: AliExpressListing): number {
  if (isSuspiciousMetrics(listing)) return 22;

  const sold = listing.soldCount ?? 0;
  const reviews = listing.reviewCount ?? 0;

  if (reviews >= 40 && sold >= 200) return 95;
  if (reviews >= 25 && sold >= 120) return 85;
  if (reviews >= 15 && sold >= 80) return 74;
  if (reviews >= 8 && sold >= 50) return 62;
  if (reviews >= 3 && sold >= 30) return 52;
  if (sold > 0 && reviews === 0) return 28;
  return 38;
}

function computeRatingQuality(listing: AliExpressListing): number {
  const rating = listing.rating ?? 0;
  const reviews = listing.reviewCount ?? 0;
  if (reviews < 3) return rating >= 4.5 ? 52 : rating >= 4.0 ? 42 : 30;

  if (rating >= 4.7) return 96;
  if (rating >= 4.5) return 86;
  if (rating >= 4.3) return 72;
  if (rating >= 4.0) return 55;
  return 28;
}

function haystackFor(listing: AliExpressListing, matchedKeyword?: string): string {
  return heuristicTitleHaystack(
    listing.title,
    listing.titleEn,
    matchedKeyword,
  );
}

function computeProblemFit(
  listing: AliExpressListing,
  matchedKeyword?: string,
): number {
  const haystack = haystackFor(listing, matchedKeyword);

  if (isGenericTitleInHaystack(haystack)) return 12;
  if (isProblemSolvingInHaystack(haystack)) return 92;
  if (listing.problemSolvingTitle) return 85;
  if ((listing.uniquenessScore ?? 0) >= 55) return 62;
  if ((listing.discoveryScore ?? 0) >= 50) return 58;
  return 42;
}

export function isHardBannedListing(
  listing: AliExpressListing,
  matchedKeyword?: string,
): boolean {
  const haystack = haystackFor(listing, matchedKeyword).toLowerCase();
  const banned =
    /\b(replica|counterfeit|fake|wholesale|bulk lot|random style|assorted|coloring book)\b/i;
  return banned.test(haystack);
}

/**
 * Weighted discover score — supports Arabic titles via keyword + titleEn context.
 */
export function computeDiscoverScore(
  listing: AliExpressListing,
  options?: DiscoverScoreOptions,
): DiscoverScoreBreakdown {
  const targetYear = options?.targetYear ?? new Date().getUTCFullYear();
  const matchedKeyword = options?.matchedKeyword;
  const enriched = enrichListingQuality(listing, targetYear);
  const haystack = haystackFor(enriched, matchedKeyword);

  const trust = computeTrustScore(enriched);
  const problemFit = computeProblemFit(enriched, matchedKeyword);
  const margin = computeMarginScore(enriched, options?.targetMarginPercent);
  const salesCredibility = computeSalesCredibility(enriched);
  const ratingQuality = computeRatingQuality(enriched);

  let finalScore = clampScore(
    trust * 0.22 +
      problemFit * 0.28 +
      margin * 0.18 +
      salesCredibility * 0.16 +
      ratingQuality * 0.16,
  );

  const flags: string[] = [];

  if (isHardBannedListing(enriched, matchedKeyword)) {
    finalScore = Math.min(finalScore, 18);
    flags.push("مرفوض (جملة/عشوائي/مقلد)");
  }

  if (enriched.suspiciousMetrics || isSuspiciousMetrics(enriched)) {
    finalScore = Math.min(finalScore, 48);
    flags.push("أرقام مشبوهة");
  }

  if (isGenericTitleInHaystack(haystack) && !isProblemSolvingInHaystack(haystack)) {
    finalScore = Math.min(finalScore, 52);
    flags.push("عنوان عام");
  }

  if (!isProblemSolvingInHaystack(haystack) && problemFit < 55) {
    finalScore -= 6;
    flags.push("مشكلة غير واضحة في العنوان");
  }

  finalScore = clampScore(finalScore);

  if (enriched.isCurrentYear) flags.push("منتج حديث");
  if (enriched.isChoice) flags.push("Choice");
  if (enriched.isFreeShipping) flags.push("شحن مجاني");
  if (problemFit >= 80) flags.push("يحل مشكلة");

  return {
    trust,
    problemFit,
    margin,
    salesCredibility,
    ratingQuality,
    finalScore,
    flags,
  };
}

export function passesDiscoverPick(
  listing: AliExpressListing,
  minScore: number,
  options?: DiscoverScoreOptions,
): boolean {
  if (isHardBannedListing(listing, options?.matchedKeyword)) return false;
  const { finalScore } = computeDiscoverScore(listing, options);
  return finalScore >= minScore;
}

export function explainRejectReason(
  listing: AliExpressListing,
  minScore: number,
  options?: DiscoverScoreOptions,
): string {
  if (isHardBannedListing(listing, options?.matchedKeyword)) {
    return "مرفوض: جملة/عشوائي/مقلد";
  }
  const breakdown = computeDiscoverScore(listing, options);
  if (breakdown.finalScore < minScore) {
    return `score ${breakdown.finalScore} أقل من ${minScore}`;
  }
  return breakdown.flags.join(" · ") || "لم يمرّ الفلتر";
}

/** @deprecated use passesDiscoverPick */
export function passesImpressiveGate(
  listing: AliExpressListing,
  minScore: number,
  targetYear = new Date().getUTCFullYear(),
): boolean {
  return passesDiscoverPick(listing, minScore, { targetYear });
}
