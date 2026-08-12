import type { AliExpressListing } from "../types";
import {
  computeTrustScore,
  enrichListingQuality,
  isGenericTitle,
  isProblemSolvingTitle,
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

const DEFAULT_TARGET_MARGIN = 40;
const TARGET_COST_MAX = 35;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function computeMarginScore(
  listing: AliExpressListing,
  targetMarginPercent = DEFAULT_TARGET_MARGIN,
): number {
  const cost = listing.originalPrice ?? 0;
  if (cost <= 0) return 0;
  if (cost > 80) return 25;
  if (cost <= TARGET_COST_MAX) return 92;
  if (cost <= 50) return 78;
  return 55;
}

function computeSalesCredibility(listing: AliExpressListing): number {
  if (isSuspiciousMetrics(listing)) return 5;

  const sold = listing.soldCount ?? 0;
  const reviews = listing.reviewCount ?? 0;

  if (reviews >= 40 && sold >= 200) return 95;
  if (reviews >= 25 && sold >= 120) return 85;
  if (reviews >= 15 && sold >= 80) return 72;
  if (reviews >= 8 && sold >= 50) return 58;
  if (sold > 0 && reviews === 0) return 18;
  return 35;
}

function computeRatingQuality(listing: AliExpressListing): number {
  const rating = listing.rating ?? 0;
  const reviews = listing.reviewCount ?? 0;
  if (reviews < 5) return rating >= 4.5 ? 45 : 25;

  if (rating >= 4.7) return 98;
  if (rating >= 4.5) return 88;
  if (rating >= 4.3) return 72;
  if (rating >= 4.0) return 50;
  return 20;
}

function computeProblemFit(listing: AliExpressListing): number {
  if (isGenericTitle(listing.title) && !isProblemSolvingTitle(listing.title)) {
    return 8;
  }
  if (isProblemSolvingTitle(listing.title)) return 95;
  if (listing.problemSolvingTitle) return 90;
  if ((listing.uniquenessScore ?? 0) >= 60) return 65;
  return 28;
}

/**
 * Weighted discover score — tuned for «منتجات مبهرة» not generic AE junk.
 * Cutoff 72+ for daily picks; 85+ exceptional.
 */
export function computeDiscoverScore(
  listing: AliExpressListing,
  options?: { targetMarginPercent?: number; targetYear?: number },
): DiscoverScoreBreakdown {
  const targetYear = options?.targetYear ?? new Date().getUTCFullYear();
  const enriched = enrichListingQuality(listing, targetYear);

  const trust = computeTrustScore(enriched);
  const problemFit = computeProblemFit(enriched);
  const margin = computeMarginScore(enriched, options?.targetMarginPercent);
  const salesCredibility = computeSalesCredibility(enriched);
  const ratingQuality = computeRatingQuality(enriched);

  let finalScore = clampScore(
    trust * 0.25 +
      problemFit * 0.25 +
      margin * 0.2 +
      salesCredibility * 0.15 +
      ratingQuality * 0.15,
  );

  const flags: string[] = [];

  if (enriched.suspiciousMetrics || isSuspiciousMetrics(enriched)) {
    finalScore = Math.min(finalScore, 25);
    flags.push("أرقام مشبوهة");
  }

  if (isGenericTitle(enriched.title) && !isProblemSolvingTitle(enriched.title)) {
    finalScore = Math.min(finalScore, 45);
    flags.push("عنوان عام/مكرر");
  }

  if (!isProblemSolvingTitle(enriched.title) && problemFit < 50) {
    finalScore = Math.min(finalScore, 55);
    flags.push("ما يحل مشكلة واضحة");
  }

  if (enriched.isCurrentYear) flags.push("منتج حديث");
  if (enriched.isChoice) flags.push("Choice");
  if (enriched.isFreeShipping) flags.push("شحن مجاني");
  if (problemFit >= 85) flags.push("يحل مشكلة");

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

export function passesImpressiveGate(
  listing: AliExpressListing,
  minScore: number,
  targetYear = new Date().getUTCFullYear(),
): boolean {
  const { finalScore, flags } = computeDiscoverScore(listing, { targetYear });
  if (finalScore < minScore) return false;
  if (flags.includes("أرقام مشبوهة")) return false;
  if (flags.includes("عنوان عام/مكرر")) return false;
  return true;
}
