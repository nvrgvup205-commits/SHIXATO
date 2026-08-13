import { describe, expect, it } from "vitest";
import {
  buildSearchKeywordChain,
  getCategorySearchKeywords,
  CATEGORY_POWER_KEYWORDS,
} from "./category-keywords";
import { PRODUCT_CATEGORIES } from "./categories";

describe("category-keywords", () => {
  it("has power keywords for every dashboard category", () => {
    for (const cat of PRODUCT_CATEGORIES) {
      const keywords = getCategorySearchKeywords(cat.id, 10);
      expect(keywords.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("returns curated keywords for cars", () => {
    const kw = getCategorySearchKeywords("cars", 5);
    expect(kw[0]).toBe("car organizer");
    expect(kw).toContain("car seat gap filler");
  });

  it("buildSearchKeywordChain dedupes and prioritizes primary", () => {
    const chain = buildSearchKeywordChain("car accessories", "cars", 6);
    expect(chain[0]).toBe("car accessories");
    expect(chain.length).toBeGreaterThan(1);
    expect(new Set(chain.map((k) => k.toLowerCase())).size).toBe(chain.length);
  });

  it("covers all category ids in CATEGORY_POWER_KEYWORDS", () => {
    const ids = PRODUCT_CATEGORIES.map((c) => c.id);
    for (const id of ids) {
      expect(CATEGORY_POWER_KEYWORDS[id]?.length ?? 0).toBeGreaterThanOrEqual(10);
    }
  });
});
