import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Env } from "../types";

const mockHasToken = vi.fn();
const mockDeepSearch = vi.fn();
const mockEnrich = vi.fn();
const mockRefilter = vi.fn();

vi.mock("./aliexpress-credentials", () => ({
  hasAliExpressAccessToken: (...args: unknown[]) => mockHasToken(...args),
}));

vi.mock("./deep-search", () => ({
  deepSearchPool: (...args: unknown[]) => mockDeepSearch(...args),
}));

vi.mock("./listing-enricher", () => ({
  enrichListingsFromApi: (...args: unknown[]) => mockEnrich(...args),
}));

vi.mock("./aliexpress", () => ({
  AliExpressService: vi.fn().mockImplementation(() => ({
    refilterListings: mockRefilter,
    buildSearchUrl: () => "https://www.aliexpress.com/w/wholesale-test.html",
  })),
}));

const scrapeItem = {
  aliexpressId: "456",
  title: "Scrape Toy",
  url: "https://www.aliexpress.com/item/456.html",
  image: "https://img.test/2.jpg",
  originalPrice: 5,
  currency: "USD",
};

const apiItem = {
  aliexpressId: "123",
  title: "API Toy",
  url: "https://www.aliexpress.com/item/123.html",
  image: "https://img.test/1.jpg",
  originalPrice: 9.99,
  currency: "USD",
};

describe("hybridAliExpressSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefilter.mockImplementation((items: unknown[]) => items);
    mockEnrich.mockImplementation(
      async (_env: unknown, items: { aliexpressId: string }[]) =>
        items.map((l) => ({ ...l, enrichmentSources: ["api"] as const })),
    );
    mockDeepSearch.mockResolvedValue({
      pool: [scrapeItem, apiItem],
      keywordsTried: ["kids toys", "car organizer"],
      scrapeCount: 1,
      apiCount: 1,
      stoppedEarly: false,
    });
  });

  it("uses deep search pool and returns merged results", async () => {
    mockHasToken.mockResolvedValue(true);

    const { hybridAliExpressSearch } = await import("./hybrid-search");
    const result = await hybridAliExpressSearch({} as Env, {
      query: "kids toys",
      category: "kids-toys",
      currency: "USD",
    });

    expect(mockDeepSearch).toHaveBeenCalled();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.meta?.source).toBe("hybrid");
    expect(result.meta?.keywordsTried?.length).toBeGreaterThan(0);
  });

  it("returns scraping source when API empty", async () => {
    mockHasToken.mockResolvedValue(false);
    mockDeepSearch.mockResolvedValue({
      pool: [scrapeItem],
      keywordsTried: ["kids toys"],
      scrapeCount: 1,
      apiCount: 0,
      stoppedEarly: false,
    });

    const { hybridAliExpressSearch } = await import("./hybrid-search");
    const result = await hybridAliExpressSearch({} as Env, {
      query: "kids toys",
      currency: "USD",
    });

    expect(result.meta?.source).toBe("scraping");
    expect(result.results).toHaveLength(1);
  });

  it("throws when deep search pool is empty", async () => {
    mockHasToken.mockResolvedValue(true);
    mockDeepSearch.mockResolvedValue({
      pool: [],
      keywordsTried: ["kids toys"],
      scrapeCount: 0,
      apiCount: 0,
      stoppedEarly: false,
    });

    const { hybridAliExpressSearch } = await import("./hybrid-search");
    await expect(
      hybridAliExpressSearch({} as Env, { query: "kids toys" }),
    ).rejects.toThrow(/لم نجد منتجات/);
  });
});
