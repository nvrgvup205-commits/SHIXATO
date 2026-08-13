import { describe, expect, it } from "vitest";
import {
  buildAliExpressSignBase,
  signAliExpressRequest,
  sortAliExpressParams,
} from "./aliexpress-sign";

describe("aliexpress-sign", () => {
  it("sorts params and excludes sign/empty values", () => {
    expect(
      sortAliExpressParams({
        z: "9",
        a: "1",
        sign: "skip",
        empty: "",
        missing: undefined,
      }),
    ).toEqual({ a: "1", z: "9" });
  });

  it("builds sign base with api path prefix", () => {
    expect(
      buildAliExpressSignBase("/auth/token/create", {
        app_key: "542618",
        code: "abc",
        sign_method: "sha256",
        timestamp: "123",
      }),
    ).toBe("/auth/token/createapp_key542618codeabcsign_methodsha256timestamp123");
  });

  it("produces stable uppercase hex signature", async () => {
    const sign = await signAliExpressRequest(
      "/auth/token/create",
      {
        app_key: "542618",
        code: "test-code",
        sign_method: "sha256",
        timestamp: "1700000000000",
      },
      "test-secret",
    );
    expect(sign).toMatch(/^[0-9A-F]{64}$/);
    const again = await signAliExpressRequest(
      "/auth/token/create",
      {
        app_key: "542618",
        code: "test-code",
        sign_method: "sha256",
        timestamp: "1700000000000",
      },
      "test-secret",
    );
    expect(again).toBe(sign);
  });
});
