import { describe, expect, it } from "vitest";
import { AliExpressService } from "./aliexpress";

describe("AliExpressService metrics enrichment", () => {
  it("fills reviewCount from HTML when JSON card omitted localeEvalCnt", () => {
    const fixture = `
      <html><script>
      {"itemList":{"content":[{
        "productId":"1005009960363169",
        "title":{"displayTitle":"Power Bank Case"},
        "prices":{"salePrice":{"currencyCode":"USD","minPrice":12.5}},
        "trade":{"tradeDesc":"2,500+ sold"},
        "evaluation":{"starRating":4.7}
      }]},
      "extra":{"productId":"1005009960363169","localeEvalCnt":186,"realTradeCount":2500}}
      </script></html>
    `;

    const row = new AliExpressService().parseSearchHtml(fixture)[0]!;
    expect(row.soldCount).toBe(2500);
    expect(row.reviewCount).toBe(186);
    expect(row.rating).toBe(4.7);
  });
});
