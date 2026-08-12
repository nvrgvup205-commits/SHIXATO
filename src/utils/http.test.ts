import { describe, expect, it } from "vitest";
import {
  applyMarkup,
  canonicalAliExpressProductUrl,
  extractAliExpressId,
  resolveAliExpressProductUrl,
} from "./http";

describe("extractAliExpressId", () => {
  it("parses item URLs", () => {
    expect(
      extractAliExpressId("https://www.aliexpress.com/item/1005006123456789.html"),
    ).toBe("1005006123456789");
  });

  it("parses aliexpress.us item URLs", () => {
    expect(
      extractAliExpressId("https://www.aliexpress.us/item/1005005542430125.html"),
    ).toBe("1005005542430125");
  });

  it("parses protocol-relative item URLs", () => {
    expect(
      extractAliExpressId("//www.aliexpress.com/item/3256812556172654.html"),
    ).toBe("3256812556172654");
  });

  it("parses path-only item URLs", () => {
    expect(extractAliExpressId("/item/3256812556172654.html")).toBe(
      "3256812556172654",
    );
  });

  it("accepts bare ids", () => {
    expect(extractAliExpressId("1005006123456789")).toBe("1005006123456789");
  });

  it("returns null for garbage", () => {
    expect(extractAliExpressId("not-a-product")).toBeNull();
  });
});

describe("canonicalAliExpressProductUrl", () => {
  it("builds www.aliexpress.com item page", () => {
    expect(canonicalAliExpressProductUrl("1005006123456789")).toBe(
      "https://www.aliexpress.com/item/1005006123456789.html",
    );
  });
});

describe("resolveAliExpressProductUrl", () => {
  it("canonicalizes tracking / regional URLs", () => {
    expect(
      resolveAliExpressProductUrl(
        "https://www.aliexpress.us/item/1005005542430125.html?spm=a2g0o.detail.1000006.1",
        "1005005542430125",
      ),
    ).toBe("https://www.aliexpress.com/item/1005005542430125.html");
  });

  it("uses id when detail URL is empty", () => {
    expect(resolveAliExpressProductUrl("", "3256812556172654")).toBe(
      "https://www.aliexpress.com/item/3256812556172654.html",
    );
  });
});

describe("applyMarkup", () => {
  it("applies markup and rounds to cents", () => {
    expect(applyMarkup(10, 1.4)).toBe(14);
    expect(applyMarkup(9.99, 1.5)).toBe(14.99);
  });
});
