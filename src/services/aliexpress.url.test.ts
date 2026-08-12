import { describe, expect, it } from "vitest";
import {
  ALIEXPRESS_SEARCH_URL_PARAMS,
  slugifyWholesaleQuery,
} from "../data/aliexpress-search-url";
import { AliExpressService } from "../services/aliexpress";

describe("slugifyWholesaleQuery", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyWholesaleQuery("Phone Case iPhone 15")).toBe(
      "phone-case-iphone-15",
    );
  });

  it("strips special characters", () => {
    expect(slugifyWholesaleQuery("café & téléphone")).toBe("cafe-telephone");
  });

  it("falls back to product for empty input", () => {
    expect(slugifyWholesaleQuery("")).toBe("product");
  });
});

describe("AliExpressService.buildSearchUrl", () => {
  const svc = new AliExpressService();

  it("builds canonical wholesale path without filters (Arabic default)", () => {
    expect(svc.buildSearchUrl({ query: "wireless earbuds", sort: "default" })).toBe(
      "https://ar.aliexpress.com/w/wholesale-wireless-earbuds.html?lang=ar",
    );
  });

  it("uses www host for English locale", () => {
    expect(
      svc.buildSearchUrl({ query: "wireless earbuds", sort: "default", locale: "en" }),
    ).toBe("https://www.aliexpress.com/w/wholesale-wireless-earbuds.html");
  });

  it("maps official SortType for orders", () => {
    expect(
      svc.buildSearchUrl({ query: "phone case", sort: "orders", locale: "en" }),
    ).toBe(
      "https://www.aliexpress.com/w/wholesale-phone-case.html?SortType=total_tranpro_desc",
    );
  });

  it("includes verified price and shipping filters", () => {
    const url = svc.buildSearchUrl({
      query: "phone case",
      sort: "price_asc",
      locale: "en",
      minPrice: 5,
      maxPrice: 15,
      shipFromCountry: "CN",
      shipToCountry: "SA",
      freeShipping: true,
      choiceOnly: true,
      highRatedSellers: true,
      unitPrice: true,
      page: 2,
    });

    expect(url).toBe(
      "https://www.aliexpress.com/w/wholesale-phone-case.html?" +
        "page=2&SortType=price_asc&minPrice=5&maxPrice=15&shipFromCountry=CN&" +
        "shipCountry=SA&isFreeShip=y&g=y&isFavorite=y&isUnitPrice=y",
    );
  });

  it("omits default sort param", () => {
    expect(svc.buildSearchUrl({ query: "toy", sort: "default", locale: "en" })).toBe(
      "https://www.aliexpress.com/w/wholesale-toy.html",
    );
  });

  it("documents every supported official param key", () => {
    const keys = Object.keys(ALIEXPRESS_SEARCH_URL_PARAMS);
    const sample = svc.buildSearchUrl({
      query: "x",
      sort: "newest",
      locale: "en",
      minPrice: 1,
      maxPrice: 9,
      shipFromCountry: "US",
      shipToCountry: "AE",
      freeShipping: true,
      choiceOnly: true,
      highRatedSellers: true,
      unitPrice: true,
      page: 3,
    });
    const qs = sample.split("?")[1] ?? "";
    const paramNames = [...new Set(qs.split("&").map((p) => p.split("=")[0]))];
    for (const key of keys) {
      expect(paramNames).toContain(key);
    }
  });
});
