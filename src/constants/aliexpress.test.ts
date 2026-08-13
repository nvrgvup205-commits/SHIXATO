import { describe, expect, it } from "vitest";
import {
  isExpectedAliExpressAppKey,
  SHIXATO_ALIEXPRESS_APP_KEY,
} from "./aliexpress";

describe("SHIXATO AliExpress App Key", () => {
  it("is fixed to the Shixato console app", () => {
    expect(SHIXATO_ALIEXPRESS_APP_KEY).toBe("542818");
  });

  it("rejects wrong keys", () => {
    expect(isExpectedAliExpressAppKey("542818")).toBe(true);
    expect(isExpectedAliExpressAppKey("542618")).toBe(false);
    expect(isExpectedAliExpressAppKey("")).toBe(false);
  });
});
