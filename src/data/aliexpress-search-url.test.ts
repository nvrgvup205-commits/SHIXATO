import { describe, expect, it } from "vitest";
import { buildLegacyWholesaleUrl } from "../data/aliexpress-search-url";

describe("buildLegacyWholesaleUrl", () => {
  it("builds SearchText wholesale URL with sort", () => {
    const url = buildLegacyWholesaleUrl({
      query: "car accessories",
      sort: "total_tranpro_desc",
      locale: "en",
    });
    expect(url).toContain("SearchText=car+accessories");
    expect(url).toContain("SortType=total_tranpro_desc");
    expect(url).toContain("aliexpress.com/wholesale");
  });
});
