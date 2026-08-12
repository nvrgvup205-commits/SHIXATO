import { describe, expect, it } from "vitest";
import {
  filterAndSortResults,
  itemIsFreeShipping,
  itemSold,
} from "./result-filters";

const sample = [
  {
    originalPrice: 20,
    soldCount: 100,
    rating: 4.2,
    shippingType: "paid",
    isChoice: false,
  },
  {
    originalPrice: 5,
    soldCount: 900,
    rating: 4.8,
    shippingType: "free",
    isFreeShipping: true,
    isChoice: true,
  },
  {
    originalPrice: 12,
    sold: "1.2k sold",
    rating: 4.6,
    shippingType: "free",
    isChoice: false,
  },
];

describe("result-filters", () => {
  it("parses sold counts including k suffix", () => {
    expect(itemSold({ sold: "1.2k sold" })).toBe(1200);
  });

  it("detects free shipping", () => {
    expect(itemIsFreeShipping({ shippingType: "free" })).toBe(true);
    expect(itemIsFreeShipping({ shippingType: "paid" })).toBe(false);
  });

  it("sorts by price descending", () => {
    const out = filterAndSortResults(sample, {
      sort: "price_desc",
      shipping: "all",
      choiceOnly: false,
      highRated: false,
    });
    expect(out.map((i) => i.originalPrice)).toEqual([20, 12, 5]);
  });

  it("filters free shipping only", () => {
    const out = filterAndSortResults(sample, {
      sort: "default",
      shipping: "free",
      choiceOnly: false,
      highRated: false,
    });
    expect(out).toHaveLength(2);
  });

  it("sorts by sold descending", () => {
    const out = filterAndSortResults(sample, {
      sort: "sold_desc",
      shipping: "all",
      choiceOnly: false,
      highRated: false,
    });
    expect(out[0]?.soldCount ?? itemSold(out[0]!)).toBeGreaterThanOrEqual(900);
  });
});
