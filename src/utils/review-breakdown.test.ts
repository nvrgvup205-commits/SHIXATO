import { describe, expect, it } from "vitest";
import { estimateReviewBreakdown } from "./review-breakdown";

describe("estimateReviewBreakdown", () => {
  it("returns null when inputs are missing", () => {
    expect(estimateReviewBreakdown(0, 4.5)).toBeNull();
    expect(estimateReviewBreakdown(100, 0)).toBeNull();
  });

  it("estimates negative share from star average", () => {
    const row = estimateReviewBreakdown(228, 4.9)!;
    expect(row.totalReviews).toBe(228);
    expect(row.averageRating).toBe(4.9);
    expect(row.negativeRatePercent).toBe(2);
    expect(row.estimatedNegativeReviews).toBe(5);
    expect(row.estimatedPositiveReviews).toBe(223);
    expect(row.estimated).toBe(true);
  });

  it("caps negative rate at 100%", () => {
    const row = estimateReviewBreakdown(50, 1)!;
    expect(row.negativeRatePercent).toBe(80);
    expect(row.estimatedNegativeReviews).toBe(40);
    expect(row.estimatedPositiveReviews).toBe(10);
  });
});
