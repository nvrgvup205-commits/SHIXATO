import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Env } from "../types";

const mockHasToken = vi.fn();
const mockFetchFeed = vi.fn();
const mockEnrich = vi.fn();
const mockScrapeSearch = vi.fn();
const mockRefilter = vi.fn();

vi.mock("./aliexpress-credentials", () => ({
  hasAliExpressAccessToken: (...args: unknown[]) => mockHasToken(...args),
}));

vi.mock("./aliexpress-api", () => ({
  AliExpressApi: {
    fromEnv: vi.fn(async () => ({
      fetchRecommendFeed: mockFetchFeed,
    })),
  },
}));

vi.mock("./listing-enricher", () => ({
  enrichListingsFromApi: (...args: unknown[]) => mockEnrich(...args),
}));

vi.mock("./aliexpress", () => ({
  AliExpressService: vi.fn().mockImplementation(() => ({
    search: mockScrapeSearch,
    refilterListings: mockRefilter,
    buildSearchUrl: () => "https://www.aliexpress.com/wholesale?SearchText=test",
  })),
}));

describe("hybridAliExpressSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefilter.mockImplementation((items) => items);
    mockEnrich.mockImplementation(
      async (_env: unknown, items: { aliexpressId: string }[]) =>
        items.map((l) => ({ ...l, enrichmentSources: ["api"] as const })),
    );
  });

  it("uses API only when token exists", async () => {
    mockHasToken.mockResolvedValue(true);
    mockFetchFeed.mockResolvedValue([
      {
        product_id: "123",
        title: "Car Phone Holder",
        price: 9.99,
        image_url: "https://img.test/1.jpg",
        link: "https://www.aliexpress.com/item/123.html",
        sales: 500,
        rating: 4.8,
        reviews: 120,
      },
    ]);

    const { hybridAliExpressSearch } = await import("./hybrid-search");
    const result = await hybridAliExpressSearch({} as Env, {
      query: "car accessories",
      currency: "USD",
    });

    expect(mockFetchFeed).toHaveBeenCalled();
    expect(mockScrapeSearch).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
    expect(result.meta?.source).toBe("api");
  });

  it("falls back to scraping without token", async () => {
    mockHasToken.mockResolvedValue(false);
    mockScrapeSearch.mockResolvedValue({
      query: "test",
      page: 1,
      searchUrl: "https://example.com",
      filtersApplied: {},
      results: [],
      totalParsed: 0,
      totalAfterFilter: 0,
    });

    const { hybridAliExpressSearch } = await import("./hybrid-search");
    const result = await hybridAliExpressSearch({} as Env, { query: "test" });

    expect(mockScrapeSearch).toHaveBeenCalled();
    expect(mockFetchFeed).not.toHaveBeenCalled();
    expect(result.meta?.source).toBe("scraping");
  });
});
