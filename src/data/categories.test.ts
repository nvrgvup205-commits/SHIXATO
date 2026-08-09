import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES, resolveSearchQuery } from "./categories";

describe("PRODUCT_CATEGORIES", () => {
  it("has about 50 choices", () => {
    expect(PRODUCT_CATEGORIES.length).toBeGreaterThanOrEqual(45);
    expect(PRODUCT_CATEGORIES.length).toBeLessThanOrEqual(60);
  });
});

describe("resolveSearchQuery", () => {
  it("uses free text when provided", () => {
    const r = resolveSearchQuery({ query: "led strip", category: "cars" });
    expect(r.query).toBe("led strip");
  });

  it("falls back to category when query empty", () => {
    const r = resolveSearchQuery({ query: "", category: "kids-toys" });
    expect(r.query).toBe("kids toys");
    expect(r.categoryLabelAr).toContain("أطفال");
  });

  it("returns empty when neither set", () => {
    expect(resolveSearchQuery({ query: " " }).query).toBe("");
  });
});
