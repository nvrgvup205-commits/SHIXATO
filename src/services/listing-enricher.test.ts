import { describe, expect, it } from "vitest";
import type { AliExpressListing } from "../types";
import { computeWowHeuristic } from "./wow-scoring";

describe("turbo discover problem-solving filter", () => {
  it("keeps problem-solving listings and skips generic ones", () => {
    const problem: AliExpressListing = {
      aliexpressId: "1",
      title: "Car seat gap filler organizer no more lost items",
      url: "https://example.com/1",
      image: "https://example.com/a.jpg",
      originalPrice: 9,
      currency: "USD",
      images: ["a", "b", "c", "d", "e"],
    };
    const generic: AliExpressListing = {
      aliexpressId: "2",
      title: "Random style sticker assorted wholesale lot",
      url: "https://example.com/2",
      image: "https://example.com/b.jpg",
      originalPrice: 2,
      currency: "USD",
    };

    const problemScore = computeWowHeuristic(problem, "car gap filler");
    const genericScore = computeWowHeuristic(generic, "car gap filler");

    expect(problemScore.problemClarity).toBeGreaterThanOrEqual(6);
    expect(genericScore.problemClarity).toBeLessThan(6);
  });
});
