import { describe, expect, it } from "vitest";
import { AliExpressService } from "./aliexpress";

describe("AliExpressService.buildSearchUrl", () => {
  it("uses ar.aliexpress.com for Arabic locale", () => {
    const url = new AliExpressService().buildSearchUrl({
      query: "phone case",
      locale: "ar",
      sort: "orders",
    });
    expect(url).toMatch(/^https:\/\/ar\.aliexpress\.com\//);
    expect(url).toContain("lang=ar");
  });

  it("skips price filters in minimal mode", () => {
    const url = new AliExpressService().buildSearchUrl(
      {
        query: "gadgets",
        minPrice: 5,
        maxPrice: 50,
        freeShipping: true,
        applyUrlFilters: false,
      },
      { minimal: true },
    );
    expect(url).not.toContain("minPrice");
    expect(url).not.toContain("isFreeShip");
  });
});

describe("AliExpressService soft scoring", () => {
  it("keeps results in soft mode even when strict thresholds not met", () => {
    const svc = new AliExpressService();
    const html = `
      <html><script>
      {"itemList":{"content":[
        {"productId":"1005001111111111","lunchTime":"2026-03-01 00:00:00",
         "title":{"displayTitle":"Smart Car Phone Holder Organizer Mount"},
         "prices":{"salePrice":{"currencyCode":"USD","minPrice":8.5}},
         "trade":{"realTradeCount":1200},"evaluation":{"starRating":4.6,"localeEvalCnt":180}},
        {"productId":"1005002222222222","lunchTime":"2026-02-15 00:00:00",
         "title":{"displayTitle":"Portable Multi-Function Storage Organizer"},
         "prices":{"salePrice":{"currencyCode":"USD","minPrice":3.2}},
         "trade":{"realTradeCount":800},"evaluation":{"starRating":4.7,"localeEvalCnt":95}}
      ]}}
      </script></html>
    `;
    const parsed = svc.parseSearchHtml(html);
    const filtered = (svc as unknown as { applyClientFilters: Function }).applyClientFilters(
      parsed,
      {
        filterMode: "soft",
        presetGrade: "balanced",
        minSold: 500,
        minRating: 4.5,
      },
    );
    expect(filtered.length).toBeGreaterThan(0);
  });
});
