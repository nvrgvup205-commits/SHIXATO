import { describe, expect, it } from "vitest";
import { TemuService } from "./temu";

describe("TemuService.parseSearchHtml", () => {
  it("extracts goods from SSR goodsList blocks", () => {
    const fixture = `
      "goodsList":[{"colType":"GOODS","goodsId":"601099555016475",
      "goodsName":"Car Phone Holder Magnetic Mount",
      "hdThumbUrl":"https:\\u002F\\u002Fimg.kwcdn.com\\u002Fproduct\\u002Ffancy\\u002Fdemo.jpg",
      "priceInfo":{"price":995,"currency":"USD","priceStr":"$9.95"},
      "salesTip":"250K+ sold"}]
    `;

    const rows = new TemuService().parseSearchHtml(fixture, "phone holder");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.externalId).toBe("601099555016475");
    expect(rows[0]!.title).toContain("Phone Holder");
    expect(rows[0]!.originalPrice).toBe(9.95);
    expect(rows[0]!.currency).toBe("USD");
    expect(rows[0]!.marketplace).toBe("temu");
  });

  it("builds sa-en search URL", () => {
    const url = new TemuService().buildSearchUrl("phone holder");
    expect(url).toContain("temu.com/sa-en/w/search.html");
    expect(url).toContain("search_key");
  });
});
