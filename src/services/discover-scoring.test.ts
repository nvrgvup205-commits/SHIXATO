import { describe, expect, it } from "vitest";
import { getTrendingKeywords } from "../data/trending-keywords";
import { computeDiscoverScore, passesImpressiveGate } from "../services/discover-scoring";
import type { AliExpressListing } from "../types";

describe("getTrendingKeywords", () => {
  it("returns car organizer keywords for cars category", () => {
    const keys = getTrendingKeywords("cars", 5);
    expect(keys.length).toBe(5);
    expect(keys[0]).toMatch(/car/i);
  });

  it("generates fallback keywords for unknown category with mapping", () => {
    const keys = getTrendingKeywords("cleaning", 4);
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe("computeDiscoverScore", () => {
  const goodListing: AliExpressListing = {
    aliexpressId: "1005006123456789",
    title: "Smart Car Organizer Multi Function Storage Holder",
    url: "https://www.aliexpress.com/item/1005006123456789.html",
    image: "https://example.com/img.jpg",
    originalPrice: 18.5,
    currency: "USD",
    soldCount: 450,
    rating: 4.7,
    reviewCount: 62,
    isFreeShipping: true,
    isChoice: true,
    storeLaunchDate: "2026-03-01",
  };

  const junkListing: AliExpressListing = {
    aliexpressId: "1005006999999999",
    title: "Random style sticker wholesale bulk lot assorted",
    url: "https://www.aliexpress.com/item/1005006999999999.html",
    image: "",
    originalPrice: 0.5,
    currency: "USD",
    soldCount: 50000,
    rating: 4.9,
    reviewCount: 3,
  };

  it("scores problem-solving products higher than generic junk", () => {
    const good = computeDiscoverScore(goodListing, { matchedKeyword: "car organizer" });
    const junk = computeDiscoverScore(junkListing, { matchedKeyword: "random stickers" });
    expect(good.finalScore).toBeGreaterThan(junk.finalScore);
    expect(good.finalScore).toBeGreaterThanOrEqual(65);
    expect(junk.finalScore).toBeLessThan(55);
  });

  it("scores Arabic titles using matched keyword context", () => {
    const arabic: AliExpressListing = {
      aliexpressId: "1005006123456780",
      title: "حامل جوال للسيارة مغناطيسي",
      url: "https://www.aliexpress.com/item/1005006123456780.html",
      image: "",
      originalPrice: 12,
      currency: "USD",
      soldCount: 320,
      rating: 4.6,
      reviewCount: 45,
    };
    const withoutKw = computeDiscoverScore(arabic);
    const withKw = computeDiscoverScore(arabic, {
      matchedKeyword: "magnetic phone car mount",
    });
    expect(withKw.finalScore).toBeGreaterThanOrEqual(65);
    expect(withKw.problemFit).toBeGreaterThanOrEqual(80);
  });

  it("passes impressive gate for strong listings", () => {
    expect(passesImpressiveGate(goodListing, 65)).toBe(true);
    expect(passesImpressiveGate(junkListing, 65)).toBe(false);
  });
});
