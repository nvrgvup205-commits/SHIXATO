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
    expect(rows[0]!.url).toBe(
      "https://www.aliexpress.com/item/1005009960363169.html",
    );
  });

  it("canonicalizes productDetailUrl from search cards", () => {
    const fixture = `
      <html><script>
      {"itemList":{"content":[{
        "productId":"3256812556172654",
        "productDetailUrl":"//www.aliexpress.us/item/3256812556172654.html?spm=tracking",
        "title":{"displayTitle":"Case"},
        "prices":{"salePrice":{"currencyCode":"USD","minPrice":5.34}}
      }]}
      </script></html>
    `;
    const rows = new AliExpressService().parseSearchHtml(fixture);
    expect(rows[0]!.url).toBe(
      "https://www.aliexpress.com/item/3256812556172654.html",
    );
  });

  it("extracts shipping method, ETA, and free-shipping signals", () => {
    const fixture = `
      <html><script>
      {"itemList":{"content":[{
        "productId":"1005006967568156",
        "lunchTime":"2024-05-10 00:00:00",
        "title":{"displayTitle":"USB Charger"},
        "image":{"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/demo.jpg"},
        "prices":{"salePrice":{"currencyCode":"USD","minPrice":1.32}},
        "sellingPoints":[
          {"source":"ETA_atm","tagContent":{"tagText":"Delivery: Aug 18 - 23"}},
          {"source":"platformFreeShipping_atm","tagContent":{"tagText":"Free shipping over $10"}},
          {"source":"localplus_flag","tagContent":{"tagText":"Local"}}
        ],
        "trace":{"pdpParams":{
          "pdp_cdi":"%7B%22shipFrom%22%3A%22CN%22%7D",
          "pdp_npi":"6%40dis!USD!6.97!1.32!!!46.76!8.82!%402101c28d17865261032994621e0dca!12000038885566850!sea!SA!0!ABX!1!0"
        }}
      }]}
      </script></html>
    `;

    const row = new AliExpressService().parseSearchHtml(fixture)[0]!;
    expect(row.shipFrom).toBe("CN");
    expect(row.shipTo).toBe("SA");
    expect(row.shippingMethod).toBe("AliExpress Standard Shipping");
    expect(row.shippingMethodCode).toBe("sea");
    expect(row.shippingCarrier).toBe("ABX");
    expect(row.deliveryEstimate).toBe("Delivery: Aug 18 - 23");
    expect(row.shippingType).toBe("conditional_free");
    expect(row.shippingNote).toBe("Free shipping over $10");
    expect(row.shippingCost).toBe(8.82);
    expect(row.shippingCostCurrency).toBe("SAR");
    expect(row.isLocalWarehouse).toBe(true);
    expect(row.storeLaunchDate).toBe("2024-05-10 00:00:00");
    expect(row.isFreeShipping).toBe(true);
  });

  it("extracts all gallery images from search card images array", () => {
    const fixture = `
      <html><script>
      {"itemList":{"content":[{
        "productId":"1005006967568156",
        "title":{"displayTitle":"USB Charger"},
        "image":{"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/main.jpg"},
        "images":[
          {"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/main.jpg"},
          {"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/alt1.jpg"},
          {"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/alt2.jpg"}
        ],
        "prices":{"salePrice":{"currencyCode":"USD","minPrice":1.32}}
      }]}
      </script></html>
    `;

    const row = new AliExpressService().parseSearchHtml(fixture)[0]!;
    expect(row.images).toHaveLength(3);
    expect(row.images![0]).toMatch(/^https:\/\/.*main\.jpg/);
    expect(row.images![1]).toMatch(/alt1/);
  });

  it("marks explicit free shipping from Free_Shipping_atm", () => {
    const fixture = `
      <html><script>
      {"itemList":{"content":[{
        "productId":"3256812334956171",
        "title":{"displayTitle":"Case"},
        "prices":{"salePrice":{"currencyCode":"USD","minPrice":5.34}},
        "sellingPoints":[
          {"source":"Free_Shipping_atm","tagContent":{"tagText":"Free shipping"}}
        ],
        "trace":{"pdpParams":{
          "pdp_npi":"5.34!5.34!!!35.87!35.87!%402101d9ef17865212567734000e1054!12000058615470494!sea!US!0!ABX!1!0"
        }}
      }]}
      </script></html>
    `;

    const row = new AliExpressService().parseSearchHtml(fixture)[0]!;
    expect(row.shippingType).toBe("free");
    expect(row.shippingNote).toBe("Free shipping");
    expect(row.shipTo).toBe("US");
  });
});
