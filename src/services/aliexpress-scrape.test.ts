import { describe, expect, it } from "vitest";
import { scrapeSearchKeyword } from "./aliexpress-scrape";

const FIXTURE = `
<html><script>
{"itemList":{"content":[{
  "productId":"1005009960363169",
  "title":{"displayTitle":"Kids STEM Toy Building Blocks"},
  "image":{"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/demo.jpg"},
  "prices":{"salePrice":{"currencyCode":"USD","minPrice":4.99},"originalPrice":{"minPrice":12.99,"currencyCode":"USD"}},
  "trade":{"tradeDesc":"5,000+ sold"},
  "evaluation":{"starRating":4.8,"localeEvalCnt":120}
}]}}
</script></html>
`;

describe("aliexpress-scrape", () => {
  it("parses listings from search HTML fixture", async () => {
    const { AliExpressService } = await import("./aliexpress");
    const rows = new AliExpressService().parseSearchHtml(FIXTURE);
    expect(rows.length).toBe(1);
    expect(rows[0]!.aliexpressId).toBe("1005009960363169");
    expect(rows[0]!.title).toContain("STEM");
  });

  it("exports scrapeSearchPage function", () => {
    expect(typeof scrapeSearchKeyword).toBe("function");
  });

  it("scrapes kids toys from AliExpress (network)", async () => {
    const items = await scrapeSearchKeyword("kids toys", {
      pages: 1,
      currency: "USD",
      shipToCountry: "SA",
    });
    expect(items.length).toBeGreaterThan(10);
    expect(items[0]!.aliexpressId).toMatch(/^\d+$/);
    expect(items[0]!.title.length).toBeGreaterThan(3);
  }, 30_000);
});
