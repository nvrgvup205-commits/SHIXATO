import { describe, expect, it } from "vitest";
import {
  extractAliExpressApiError,
  isAliExpressAuthError,
  isAliExpressSignatureError,
} from "./aliexpress-api-error";

describe("aliexpress-api-error", () => {
  it("reads nested sync errors", () => {
    const err = extractAliExpressApiError({
      error_response: { code: "IllegalAccessToken", msg: "bad token" },
    });
    expect(err?.msg).toBe("bad token");
  });

  it("reads flat rest errors", () => {
    const err = extractAliExpressApiError({
      type: "ISV",
      code: "MissingParameter",
      message: "access_token missing",
    });
    expect(err?.msg).toBe("access_token missing");
  });

  it("classifies auth vs signature errors", () => {
    expect(isAliExpressAuthError("IllegalAccessToken invalid")).toBe(true);
    expect(isAliExpressSignatureError("IncompleteSignature")).toBe(true);
  });
});
