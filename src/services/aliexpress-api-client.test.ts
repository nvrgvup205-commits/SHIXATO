import { describe, expect, it } from "vitest";
import { AliExpressApiClientService } from "./aliexpress-api-client";

describe("AliExpressApiClientService.validateProduct", () => {
  const client = new AliExpressApiClientService(
    { DEFAULT_MARKUP: "1.4" } as never,
    { callSync: async () => ({}) } as never,
  );

  it("marks rich listings as analyzable", () => {
    const result = client.validateProduct({
      title: "Smart kitchen organizer rack for cabinets",
      price: 12.5,
      sales: 1200,
      rating: 4.7,
      reviews: 180,
      images: ["https://img/a.jpg", "https://img/b.jpg"],
    });
    expect(result.ai_ready).toBe(true);
    expect(result.can_analyze).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects listings without enough data", () => {
    const result = client.validateProduct({
      title: "short",
      price: 0,
      images: [],
    });
    expect(result.ai_ready).toBe(false);
    expect(result.can_analyze).toBe(false);
    expect(result.reasons).toContain("title_too_short");
    expect(result.reasons).toContain("missing_price");
  });

  it("flags suspicious sold/review ratios", () => {
    const result = client.validateProduct({
      title: "Generic wholesale sticker pack assorted",
      price: 3.2,
      sales: 50_000,
      reviews: 12,
      rating: 4.9,
      images: ["https://img/a.jpg", "https://img/b.jpg"],
    });
    expect(result.can_analyze).toBe(false);
    expect(result.reasons).toContain("suspicious_metrics");
  });
});
