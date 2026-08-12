import { describe, expect, it } from "vitest";
import type { AliExpressListing } from "../types";
import { computeWowHeuristic, passesWowGate, wowToDisplayScore } from "./wow-scoring";

describe("wow-scoring", () => {
  const clever: AliExpressListing = {
    aliexpressId: "1005006123456789",
    title: "Magnetic Folding Car Phone Holder 360 Rotate",
    url: "https://www.aliexpress.com/item/1005006123456789.html",
    image: "https://example.com/a.jpg",
    images: ["a", "b", "c", "d"],
    originalPrice: 14,
    currency: "USD",
  };

  const junk: AliExpressListing = {
    aliexpressId: "1005006999999999",
    title: "random style sticker wholesale bulk lot",
    url: "https://www.aliexpress.com/item/1005006999999999.html",
    image: "",
    originalPrice: 0.3,
    currency: "USD",
  };

  it("rates scroll-stoppers higher than junk", () => {
    const good = computeWowHeuristic(clever, "magnetic phone car mount");
    const bad = computeWowHeuristic(junk);
    expect(good.wowScore).toBeGreaterThan(bad.wowScore);
    expect(good.wowScore).toBeGreaterThanOrEqual(7);
    expect(passesWowGate(good.wowScore, 7)).toBe(true);
  });

  it("maps wow to display score", () => {
    expect(wowToDisplayScore(8)).toBe(80);
  });
});
