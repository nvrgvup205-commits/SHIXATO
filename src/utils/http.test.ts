import { describe, expect, it } from "vitest";
import { applyMarkup, extractAliExpressId } from "./http";

describe("extractAliExpressId", () => {
  it("parses item URLs", () => {
    expect(
      extractAliExpressId("https://www.aliexpress.com/item/1005006123456789.html"),
    ).toBe("1005006123456789");
  });

  it("accepts bare ids", () => {
    expect(extractAliExpressId("1005006123456789")).toBe("1005006123456789");
  });

  it("returns null for garbage", () => {
    expect(extractAliExpressId("not-a-product")).toBeNull();
  });
});

describe("applyMarkup", () => {
  it("applies markup and rounds to cents", () => {
    expect(applyMarkup(10, 1.4)).toBe(14);
    expect(applyMarkup(9.99, 1.5)).toBe(14.99);
  });
});
