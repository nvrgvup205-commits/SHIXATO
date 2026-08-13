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

const apiRow = {
  product_id: "123",
  title: "Kids Toy Car",
  price: 9.99,
  image_url: "https://img.test/1.jpg",
  link: "https://www.aliexpress.com/item/123.html",
  sales: 500,
  rating: 4.8,
  reviews: 120,
};

describe("hybridAliExpressSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefilter.mockImplementation((items) => items);
    mockEnrich.mockImplementation(
      async (_env: unknown, items: { aliexpressId: string }[]) =>
        items.map((l) => ({ ...l, enrichmentSources: ["api"] as const })),
    );
    mockScrapeSearch.mockResolvedValue({
      query: "kids toys",
      page: 1,
      searchUrl: "https://example.com",
      filtersApplied: {},
      results: [
        {
          aliexpressId: "456",
          title: "Scrape Toy",
          url: "https://www.aliexpress.com/item/456.html",
          image: "https://img.test/2.jpg",
          originalPrice: 5,
          currency: "USD",
        },
      ],
      resultsBeforeFilter: [
        {
          aliexpressId: "456",
          title: "Scrape Toy",
          url: "https://www.aliexpress.com/item/456.html",
          image: "https://img.test/2.jpg",
          originalPrice: 5,
          currency: "USD",
        },
      ],
      totalParsed: 1,
      totalAfterFilter: 1,
    });
  });

  it("merges scrape + API when token exists", async () => {
    mockHasToken.mockResolvedValue(true);
    mockFetchFeed.mockResolvedValue([apiRow]);

    const { hybridAliExpressSearch } = await import("./hybrid-search");
    const result = await hybridAliExpressSearch({} as Env, {
      query: "kids toys",
      currency: "USD",
    });

    expect(mockFetchFeed).toHaveBeenCalled();
    expect(mockScrapeSearch).toHaveBeenCalled();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.meta?.source).toBe("hybrid");
  });

  it("uses scrape when API feed is empty", async () => {
    mockHasToken.mockResolvedValue(true);
    mockFetchFeed.mockResolvedValue([]);

    const { hybridAliExpressSearch } = await import("./hybrid-search");
    const result = await hybridAliExpressSearch({} as Env, {
      query: "kids toys",
      currency: "USD",
    });

    expect(mockScrapeSearch).toHaveBeenCalled();
    expect(result.meta?.source).toBe("scraping");
    expect(result.results).toHaveLength(1);
  });

  it("falls back to scraping without token", async () => {
    mockHasToken.mockResolvedValue(false);

    const { hybridAliExpressSearch } = await import("./hybrid-search");
    const result = await hybridAliExpressSearch({} as Env, { query: "kids toys" });

    expect(mockScrapeSearch).toHaveBeenCalled();
    expect(mockFetchFeed).not.toHaveBeenCalled();
    expect(result.meta?.source).toBe("scraping");
  });
});
