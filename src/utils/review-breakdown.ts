/** Estimate positive/negative review split when only star average + total count exist. */

export interface ReviewBreakdown {
  totalReviews: number;
  averageRating: number;
  /** Estimated share of non-5★ reviews (0–100). */
  negativeRatePercent: number;
  estimatedPositiveReviews: number;
  estimatedNegativeReviews: number;
  /** True when derived from rating math, not explicit API fields. */
  estimated: boolean;
}

export function estimateReviewBreakdown(
  totalReviews: number,
  averageRating: number,
): ReviewBreakdown | null {
  if (!Number.isFinite(totalReviews) || totalReviews <= 0) return null;
  if (!Number.isFinite(averageRating) || averageRating <= 0) return null;

  const negativeRatePercent = Math.max(
    0,
    Math.min(100, Math.round((1 - averageRating / 5) * 100)),
  );
  const estimatedNegativeReviews = Math.round(
    (totalReviews * negativeRatePercent) / 100,
  );
  const estimatedPositiveReviews = Math.max(
    0,
    totalReviews - estimatedNegativeReviews,
  );

  return {
    totalReviews,
    averageRating: round1(averageRating),
    negativeRatePercent,
    estimatedPositiveReviews,
    estimatedNegativeReviews,
    estimated: true,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
