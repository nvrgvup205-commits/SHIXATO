import { describe, expect, it } from "vitest";
import { resolveDiscoverKeywords } from "./deep-search";

describe("deep-search keywords", () => {
  it("resolves curated keywords for cars without AI", () => {
    const kw = resolveDiscoverKeywords("cars", 8);
    expect(kw.length).toBeGreaterThanOrEqual(6);
    expect(kw).toContain("car organizer");
  });
});
