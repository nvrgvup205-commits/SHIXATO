import { describe, expect, it } from "vitest";
import { getTrendingKeywords } from "../data/trending-keywords";

describe("keyword fallback chain", () => {
  it("generates at least 8 keywords for any mapped category", () => {
    const keys = getTrendingKeywords("beauty", 15);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    expect(keys[0]).toMatch(/beauty/i);
  });

  it("uses curated list for cars", () => {
    const keys = getTrendingKeywords("cars", 10);
    expect(keys).toContain("car organizer");
    expect(keys.length).toBe(10);
  });
});
