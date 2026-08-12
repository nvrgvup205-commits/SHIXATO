import { describe, expect, it } from "vitest";
import { SheinService } from "./shein";

describe("SheinService.parseSearchHtml", () => {
  it("parses JSON-LD ItemList products", () => {
    const fixture = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [{
          "@type": "ItemList",
          "numberOfItems": 2,
          "itemListElement": [{
            "@type": "ListItem",
            "position": 1,
            "item": {
              "@type": "Product",
              "name": "حامل هاتف للسيارة",
              "url": "https://ar.shein.com/Car-Phone-Holder-p-40339925.html",
              "image": "https://img.ltwebstatic.com/demo.jpg",
              "sku": "40339925",
              "aggregateRating": {
                "ratingValue": "4.83",
                "reviewCount": 120
              },
              "offers": {
                "@type": "Offer",
                "price": "12.50",
                "priceCurrency": "SAR"
              }
            }
          }]
        }]
      }
      </script>
    `;

    const rows = new SheinService().parseSearchHtml(fixture, "phone holder");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.externalId).toBe("40339925");
    expect(rows[0]!.title).toContain("حامل هاتف");
    expect(rows[0]!.originalPrice).toBe(12.5);
    expect(rows[0]!.currency).toBe("SAR");
    expect(rows[0]!.marketplace).toBe("shein");
    expect(rows[0]!.rating).toBe(4.83);
    expect(rows[0]!.reviewCount).toBe(120);
  });

  it("builds ar pdsearch URL with limit params", () => {
    const url = new SheinService().buildSearchUrl("phone holder", 1, "ar");
    expect(url).toContain("ar.shein.com/pdsearch/");
    expect(url).toContain("limit=20");
  });
});
