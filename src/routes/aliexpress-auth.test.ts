import { describe, expect, it } from "vitest";
import { extractAuthorizationCode } from "./aliexpress-auth";

describe("extractAuthorizationCode", () => {
  it("returns plain code as-is", () => {
    expect(extractAuthorizationCode("abc123xyz")).toBe("abc123xyz");
  });

  it("extracts code from full callback URL", () => {
    const url =
      "https://shixato.nvrgvup205.workers.dev/api/aliexpress/callback?code=MY_CODE_123&state=abc";
    expect(extractAuthorizationCode(url)).toBe("MY_CODE_123");
  });

  it("extracts code from partial query string", () => {
    expect(extractAuthorizationCode("?code=hello%2Bworld&state=x")).toBe("hello+world");
  });

  it("returns empty for blank input", () => {
    expect(extractAuthorizationCode("   ")).toBe("");
  });
});
