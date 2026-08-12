import { resolveSearchQuery } from "../data/categories";
import type { ProductSearchFilters } from "../types";
import type {
  MarketplaceId,
  MarketplaceListing,
  MarketplaceSearchResult,
  PriceCompareResult,
} from "../types/marketplace";
import { MARKETPLACE_LABELS_AR } from "../types/marketplace";
import { AliExpressService } from "./aliexpress";
import { SheinService } from "./shein";
import { TemuService } from "./temu";

const FX_TO_USD: Record<string, number> = {
  USD: 1,
  SAR: 0.2667,
  AED: 0.2723,
  EUR: 1.08,
  GBP: 1.27,
};

function priceInUsd(listing: MarketplaceListing): number {
  const price = listing.originalPrice ?? 0;
  if (!price || price <= 0) return Number.POSITIVE_INFINITY;
  const cur = (listing.currency || "USD").toUpperCase();
  const rate = FX_TO_USD[cur] ?? 1;
  return price * rate;
}

function toMarketplaceListing(
  marketplace: MarketplaceId,
  item: {
    aliexpressId: string;
    title: string;
    url: string;
    image?: string;
    images?: string[];
    originalPrice: number;
    currency: string;
    soldCount?: number;
    rating?: number;
    reviewCount?: number;
    sold?: string;
    matchedKeyword?: string;
  },
): MarketplaceListing {
  return {
    ...item,
    marketplace,
    externalId: item.aliexpressId,
    image: item.image || "",
    images: item.images ?? (item.image ? [item.image] : []),
  };
}

export class PriceCompareService {
  private aliexpress = new AliExpressService();
  private temu = new TemuService();
  private shein = new SheinService();

  async compare(
    filters: ProductSearchFilters,
    markets?: MarketplaceId[],
  ): Promise<PriceCompareResult> {
    const start = Date.now();
    const resolved = resolveSearchQuery({
      query: filters.query,
      category: filters.category,
    });
    const query = resolved.query;

    const selected: MarketplaceId[] =
      markets?.length
        ? markets
        : ["aliexpress", "temu", "shein"];

    const marketResults: MarketplaceSearchResult[] = [];

    for (const id of selected) {
      if (id === "aliexpress") {
        const ae = await this.searchAliExpress({ ...filters, query });
        marketResults.push(ae);
      } else if (id === "temu") {
        marketResults.push(await this.temu.search({ ...filters, query }));
      } else if (id === "shein") {
        marketResults.push(await this.shein.search({ ...filters, query }));
      }
    }

    const allListings = marketResults.flatMap((m) =>
      m.results.map((r) => ({
        ...r,
        badges: [
          ...(r.badges ?? []),
          MARKETPLACE_LABELS_AR[m.marketplace],
        ],
      })),
    );

    const sorted = [...allListings].sort(
      (a, b) => priceInUsd(a) - priceInUsd(b),
    );
    const cheapest = sorted.find((x) => priceInUsd(x) < Number.POSITIVE_INFINITY);

    return {
      query,
      currency: "USD",
      markets: marketResults,
      cheapest,
      executionTimeSeconds:
        Math.round((Date.now() - start) / 100) / 10,
    };
  }

  private async searchAliExpress(
    filters: ProductSearchFilters,
  ): Promise<MarketplaceSearchResult> {
    const query = (filters.query ?? "").trim();
    try {
      const data = await this.aliexpress.search({
        ...filters,
        filterMode: filters.filterMode ?? "off",
        applyUrlFilters: false,
        fetchPages: 1,
      });

      const items = data.resultsBeforeFilter ?? data.results;
      const results = items.map((item) =>
        toMarketplaceListing("aliexpress", {
          aliexpressId: item.aliexpressId,
          title: item.title,
          url: item.url,
          image: item.image,
          images: item.images,
          originalPrice: item.originalPrice,
          currency: item.currency,
          soldCount: item.soldCount,
          rating: item.rating,
          reviewCount: item.reviewCount,
          sold: item.sold,
          matchedKeyword: query,
        }),
      );

      return {
        marketplace: "aliexpress",
        labelAr: "علي إكسبريس",
        query,
        searchUrl: data.searchUrlUsed || data.searchUrl,
        status: results.length ? "ok" : "empty",
        results,
        totalParsed: data.totalParsed ?? results.length,
        warning: data.warning,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل AliExpress";
      return {
        marketplace: "aliexpress",
        labelAr: "علي إكسبريس",
        query,
        searchUrl: "",
        status: "error",
        results: [],
        totalParsed: 0,
        warning: message,
        error: message,
      };
    }
  }
}

export function getMarketplaceSearch(
  marketplace: MarketplaceId,
): {
  search: (filters: ProductSearchFilters) => Promise<MarketplaceSearchResult>;
} {
  if (marketplace === "temu") return new TemuService();
  if (marketplace === "shein") return new SheinService();
  throw new Error("Use AliExpressService for aliexpress");
}
