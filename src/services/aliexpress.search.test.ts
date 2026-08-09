import { describe, expect, it } from "vitest";
import { AliExpressService } from "./aliexpress";

describe("AliExpressService.parseSearchHtml", () => {
  it("extracts title, image, and price from modern itemList HTML", () => {
    const fixture = `
      <html><script>
      window._dida_config_._init_data_= { data: {"x":1,
      "itemList":{"content":[{
        "productId":"1005009960363169",
        "title":{"displayTitle":"Squishy Watermelon Fidget Toy"},
        "image":{"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/demo.jpg"},
        "prices":{"salePrice":{"currencyCode":"USD","minPrice":1.59},"originalPrice":{"minPrice":8.23,"currencyCode":"USD"}},
        "trade":{"tradeDesc":"100K+ sold"},
        "evaluation":{"starRating":4.9}
      }]}
      }};
      </script></html>
    `;

    const rows = new AliExpressService().parseSearchHtml(fixture);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.aliexpressId).toBe("1005009960363169");
    expect(rows[0]!.title).toContain("Squishy");
    expect(rows[0]!.image).toMatch(/^https:\/\//);
    expect(rows[0]!.originalPrice).toBe(1.59);
    expect(rows[0]!.soldCount).toBe(100000);
    expect(rows[0]!.rating).toBe(4.9);
  });
});
