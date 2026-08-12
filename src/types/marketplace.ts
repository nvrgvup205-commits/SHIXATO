import type { AliExpressListing } from "./index";

export type MarketplaceId = "aliexpress" | "temu" | "shein";

export interface MarketplaceListing extends AliExpressListing {
  marketplace: MarketplaceId;
  externalId: string;
}

export interface MarketplaceSearchResult {
  marketplace: MarketplaceId;
  labelAr: string;
  query: string;
  searchUrl: string;
  status: "ok" | "empty" | "blocked" | "error";
  results: MarketplaceListing[];
  totalParsed: number;
  warning?: string;
  error?: string;
}

export interface PriceCompareResult {
  query: string;
  currency: string;
  markets: MarketplaceSearchResult[];
  cheapest?: MarketplaceListing;
  executionTimeSeconds: number;
}

export const MARKETPLACE_LABELS: Record<MarketplaceId, string> = {
  aliexpress: "AliExpress",
  temu: "Temu",
  shein: "Shein",
};

export const MARKETPLACE_LABELS_AR: Record<MarketplaceId, string> = {
  aliexpress: "علي إكسبريس",
  temu: "تيمو",
  shein: "شي إن",
};
