/** Trust, uniqueness, and discovery scoring for AliExpress search cards. */

export interface ListingQualityInput {
  title: string;
  soldCount?: number;
  reviewCount?: number;
  rating?: number;
  originalPrice?: number;
  storeLaunchDate?: string;
  badges?: string[];
}

export interface ListingQualityScores {
  trustScore: number;
  uniquenessScore: number;
  discoveryScore: number;
  suspiciousMetrics: boolean;
  launchYear?: number;
  isCurrentYear: boolean;
  genericTitle: boolean;
  problemSolvingTitle: boolean;
}

const GENERIC_TITLE_RE =
  /\b(sticker|stickers|coloring\s*book|random\s*style|assorted|wholesale|bulk\s*lot|lot\s+of|mixed\s+styles?|pcs\s+set|piece\s+set|generic|basic\s+plain|random\s+delivery|style\s+sent\s+randomly)\b/i;

const PROBLEM_SOLVING_RE =
  /\b(organiz|solver?|solve|fix|relief|smart|innovat|unique|creative|automatic|multi[\s-]?function|ergonomic|portable|upgrade|transform|clever|genius|magic|puzzle|stem|gadget|holder|sav(er|ing)|helper|tool\s+for|no\s+more|anti[\s-]?|self[\s-]?|instant|quick\s+|easy\s+to)\b/i;

const TREND_RE =
  /\b(viral|trending|tiktok|new\s+202[4-9]|hot\s+sale|bestsell)\b/i;

/** Sold-to-review ratio above this is usually inflated AE marketing. */
const MAX_TRUST_SOLD_REVIEW_RATIO = 45;

export function parseLaunchYear(date?: string): number | undefined {
  if (!date?.trim()) return undefined;
  const m = date.trim().match(/\b(20\d{2})\b/);
  if (!m) return undefined;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : undefined;
}

export function isSuspiciousMetrics(listing: ListingQualityInput): boolean {
  const sold = listing.soldCount ?? 0;
  const reviews = listing.reviewCount ?? 0;
  if (sold < 150) return false;
  if (reviews < 3) {
    return sold >= 800;
  }
  const ratio = sold / reviews;
  if (ratio > MAX_TRUST_SOLD_REVIEW_RATIO) return true;
  if (sold >= 10_000 && reviews < sold / 50) return true;
  if (sold >= 50_000 && reviews < 2_000) return true;
  return false;
}

export function isGenericTitle(title: string): boolean {
  return GENERIC_TITLE_RE.test(title);
}

export function isProblemSolvingTitle(title: string): boolean {
  return PROBLEM_SOLVING_RE.test(title);
}

export function isTrendyTitle(title: string, badges?: string[]): boolean {
  if (TREND_RE.test(title)) return true;
  return (badges ?? []).some((b) => /viral|trend|hot|new/i.test(b));
}

export function computeTrustScore(listing: ListingQualityInput): number {
  if (isSuspiciousMetrics(listing)) return 8;

  const sold = listing.soldCount ?? 0;
  const reviews = listing.reviewCount ?? 0;
  let score = 55;

  if (reviews >= 50) score += 18;
  else if (reviews >= 20) score += 12;
  else if (reviews >= 8) score += 6;
  else if (reviews === 0 && sold > 500) score -= 12;

  if (sold > 0 && reviews > 0) {
    const ratio = sold / reviews;
    if (ratio <= 12) score += 22;
    else if (ratio <= 25) score += 12;
    else if (ratio <= 40) score += 4;
    else score -= 18;
  }

  const rating = listing.rating ?? 0;
  if (rating >= 4.7) score += 8;
  else if (rating >= 4.4) score += 4;
  else if (rating > 0 && rating < 4.0) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeUniquenessScore(listing: ListingQualityInput): number {
  const title = listing.title || "";
  let score = 42;

  if (isGenericTitle(title)) score -= 28;
  if (isProblemSolvingTitle(title)) score += 24;
  if (isTrendyTitle(title, listing.badges)) score += 10;

  const words = title.split(/\s+/).filter(Boolean);
  if (words.length >= 4 && words.length <= 14) score += 6;
  if (words.length > 18) score -= 8;

  if ((listing.originalPrice ?? 0) > 0 && (listing.originalPrice ?? 0) < 0.4) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeLaunchYearScore(
  listing: ListingQualityInput,
  targetYear = new Date().getUTCFullYear(),
): number {
  const year = parseLaunchYear(listing.storeLaunchDate);
  if (year === targetYear) return 100;
  if (year === targetYear - 1) return 35;
  if (year != null && year < targetYear - 1) return 5;
  return 22;
}

export function computeDiscoveryScore(
  listing: ListingQualityInput,
  targetYear = new Date().getUTCFullYear(),
): ListingQualityScores {
  const trustScore = computeTrustScore(listing);
  const uniquenessScore = computeUniquenessScore(listing);
  const launchYear = parseLaunchYear(listing.storeLaunchDate);
  const launchYearScore = computeLaunchYearScore(listing, targetYear);
  const suspiciousMetrics = isSuspiciousMetrics(listing);
  const genericTitle = isGenericTitle(listing.title);
  const problemSolvingTitle = isProblemSolvingTitle(listing.title);

  let discoveryScore = Math.round(
    trustScore * 0.38 +
      uniquenessScore * 0.42 +
      launchYearScore * 0.2,
  );

  if (suspiciousMetrics) discoveryScore = Math.min(discoveryScore, 22);
  if (genericTitle && !problemSolvingTitle) discoveryScore = Math.min(discoveryScore, 40);

  return {
    trustScore,
    uniquenessScore,
    discoveryScore: Math.max(0, Math.min(100, discoveryScore)),
    suspiciousMetrics,
    launchYear,
    isCurrentYear: launchYear === targetYear,
    genericTitle,
    problemSolvingTitle,
  };
}

export function enrichListingQuality<T extends ListingQualityInput>(
  listing: T,
  targetYear = new Date().getUTCFullYear(),
): T & ListingQualityScores {
  const scores = computeDiscoveryScore(listing, targetYear);
  return { ...listing, ...scores };
}

export function passesDiscoveryGate(
  scores: ListingQualityScores,
  grade?: "starter" | "balanced" | "pro",
): boolean {
  if (scores.suspiciousMetrics) return false;
  if (grade === "pro") return scores.discoveryScore >= 62;
  if (grade === "balanced") return scores.discoveryScore >= 52;
  return scores.discoveryScore >= 42;
}
