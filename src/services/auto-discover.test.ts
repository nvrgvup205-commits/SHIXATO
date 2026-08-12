import { describe, expect, it } from "vitest";
import { computeWowHeuristic } from "./wow-scoring";

describe("auto-discover pool logic", () => {
  it("keeps hard-banned listings in pool with مرفوض flag (not dropped)", () => {
    const item = {
      aliexpressId: "1234567890",
      title: "wholesale bulk lot random style car organizer",
      url: "https://www.aliexpress.com/item/1234567890.html",
      originalPrice: 5,
      currency: "USD",
    };
    const h = computeWowHeuristic(item, "car organizer");
    expect(h.flags).toContain("مرفوض");
    expect(h.wowScore).toBeLessThanOrEqual(2);
  });

  it("scores normal car organizer titles above generic threshold", () => {
    const item = {
      aliexpressId: "9876543210",
      title: "Magnetic hidden phone mount car organizer gap filler",
      url: "https://www.aliexpress.com/item/9876543210.html",
      originalPrice: 12,
      currency: "USD",
      images: ["a", "b", "c"],
    };
    const h = computeWowHeuristic(item, "car seat gap filler");
    expect(h.flags).not.toContain("مرفوض");
    expect(h.wowScore).toBeGreaterThanOrEqual(5);
  });
});
