import { describe, expect, it } from "vitest";
import {
  computeDiscoveryScore,
  isSuspiciousMetrics,
  parseLaunchYear,
} from "./listing-discovery";

describe("listing-discovery", () => {
  it("flags inflated sold vs review counts", () => {
    expect(
      isSuspiciousMetrics({ title: "x", soldCount: 50_000, reviewCount: 600 }),
    ).toBe(true);
    expect(
      isSuspiciousMetrics({ title: "x", soldCount: 500, reviewCount: 80 }),
    ).toBe(false);
  });

  it("parses launch year from AliExpress lunchTime", () => {
    expect(parseLaunchYear("2026-03-01 00:00:00")).toBe(2026);
  });

  it("prefers problem-solving non-generic titles", () => {
    const good = computeDiscoveryScore(
      {
        title: "Smart Car Organizer Multi-Function Storage",
        soldCount: 1200,
        reviewCount: 180,
        rating: 4.7,
        storeLaunchDate: "2026-02-10 00:00:00",
      },
      2026,
    );
    const bad = computeDiscoveryScore(
      {
        title: "200pcs Random Style Kids Stickers Wholesale Lot",
        soldCount: 40_000,
        reviewCount: 500,
        rating: 4.9,
        storeLaunchDate: "2023-01-01 00:00:00",
      },
      2026,
    );
    expect(good.discoveryScore).toBeGreaterThan(bad.discoveryScore);
    expect(bad.suspiciousMetrics).toBe(true);
    expect(good.isCurrentYear).toBe(true);
  });
});
