import type { AliExpressListing, Env } from "../types";
import { extractAliExpressId } from "../utils/http";
import { computeDiscoveryScore } from "../utils/listing-discovery";
import { estimateReviewBreakdown } from "../utils/review-breakdown";
import {
  AliExpressApiClientService,
  type AliExpressApiProductDetails,
} from "./aliexpress-api-client";
import { hasAliExpressAccessToken } from "./aliexpress-credentials";
import { AliExpressService } from "./aliexpress";

export type ListingEnrichmentSource = "scrape" | "api";

export interface EnrichedListingResult {
  listing: AliExpressListing;
  sources: ListingEnrichmentSource[];
  apiProfile?: AliExpressApiProductDetails;
}

function applyDiscoveryScores(listing: AliExpressListing): AliExpressListing {
  const scores = computeDiscoveryScore(listing);
  return {
    ...listing,
    trustScore: scores.trustScore,
    uniquenessScore: scores.uniquenessScore,
    discoveryScore: scores.discoveryScore,
    suspiciousMetrics: scores.suspiciousMetrics,
    launchYear: scores.launchYear ?? listing.launchYear,
    isCurrentYear: scores.isCurrentYear,
    genericTitle: scores.genericTitle,
    problemSolvingTitle: scores.problemSolvingTitle,
  };
}

export function mergeApiProfile(
  listing: AliExpressListing,
  profile: AliExpressApiProductDetails,
): AliExpressListing {
  const shipping = profile.shippingToSaudi ?? profile.shippingOptions[0];
  const shippingCost = shipping?.amount ?? listing.shippingCost;
  const isFree =
    shippingCost === 0 ? true : listing.isFreeShipping;

  const images =
    profile.images.length > 0
      ? profile.images
      : listing.images?.length
        ? listing.images
        : listing.image
          ? [listing.image]
          : [];

  return {
    ...listing,
    title: profile.title || listing.title,
    originalPrice: profile.price > 0 ? profile.price : listing.originalPrice,
    listPrice: profile.listPrice ?? listing.listPrice,
    currency: profile.currency || listing.currency,
    soldCount: profile.sales ?? listing.soldCount,
    sold: profile.sales != null ? String(profile.sales) : listing.sold,
    reviewCount: profile.reviews ?? listing.reviewCount,
    rating: profile.rating ?? listing.rating,
    discountPercent: profile.discountPercent ?? listing.discountPercent,
    images,
    image: images[0] || listing.image,
    badges: profile.badges.length ? profile.badges : listing.badges,
    shippingCost,
    shippingCostCurrency: shipping?.currency ?? listing.shippingCostCurrency,
    deliveryEstimate:
      shipping?.estimatedDeliveryDays?.toString() ?? listing.deliveryEstimate,
    shippingMethod: shipping?.serviceName ?? listing.shippingMethod,
    shippingType: isFree ? "free" : shippingCost != null ? "paid" : listing.shippingType,
    isFreeShipping: isFree,
    shipFrom: profile.logistics?.shipFromCountry ?? listing.shipFrom,
    shipTo: profile.logistics?.shipToCountry ?? listing.shipTo ?? "SA",
    suspiciousMetrics: profile.suspiciousMetrics ?? listing.suspiciousMetrics,
    descriptionEn: profile.description ?? listing.descriptionEn,
    categoryName: profile.categoryName ?? listing.categoryName,
    storeName: profile.store?.name ?? listing.storeName,
    enrichmentSources: [...(listing.enrichmentSources ?? []), "api"],
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Batch-enrich listings via official DS API (product + shipping). */
export async function enrichListingsFromApi(
  env: Env,
  listings: AliExpressListing[],
  options?: { limit?: number; concurrency?: number },
): Promise<AliExpressListing[]> {
  if (!(await hasAliExpressAccessToken(env))) return listings;

  const limit = Math.min(Math.max(options?.limit ?? 24, 1), 48);
  const concurrency = Math.min(Math.max(options?.concurrency ?? 4, 1), 6);
  const slice = listings.slice(0, limit);
  if (!slice.length) return listings;

  let client: AliExpressApiClientService;
  try {
    client = await AliExpressApiClientService.fromEnv(env);
  } catch {
    return listings;
  }

  const enrichedSlice = await mapWithConcurrency(slice, concurrency, async (listing) => {
    const productId =
      extractAliExpressId(listing.aliexpressId) ||
      extractAliExpressId(listing.url);
    if (!productId) return listing;

    try {
      const profile = await client.getFullProductProfile(productId);
      let merged = mergeApiProfile(listing, profile);
      if (profile.reviews != null && profile.rating != null) {
        const breakdown = estimateReviewBreakdown(profile.reviews, profile.rating);
        if (breakdown) {
          merged = { ...merged, negativeRateEstimate: breakdown.negativeRatePercent };
        }
      }
      return applyDiscoveryScores(merged);
    } catch (err) {
      console.warn("batch API enrichment failed", productId, err);
      return listing;
    }
  });

  const byId = new Map(listings.map((l) => [l.aliexpressId, l]));
  for (const item of enrichedSlice) {
    byId.set(item.aliexpressId, item);
  }
  return listings.map((l) => byId.get(l.aliexpressId) ?? l);
}

/**
 * Scrape PDP metrics + optional official DS API profile for accurate AI scoring.
 */
export async function enrichListingForAnalysis(
  listing: AliExpressListing,
  env?: Env,
): Promise<EnrichedListingResult> {
  const sources: ListingEnrichmentSource[] = [];
  const scraper = new AliExpressService();

  let enriched = await scraper.enrichListingMetrics(listing);
  sources.push("scrape");
  enriched = {
    ...enriched,
    enrichmentSources: [...(enriched.enrichmentSources ?? []), "scrape"],
  };

  let apiProfile: AliExpressApiProductDetails | undefined;

  if (env && (await hasAliExpressAccessToken(env))) {
    const productId =
      extractAliExpressId(listing.aliexpressId) ||
      extractAliExpressId(listing.url);
    if (productId) {
      try {
        const client = await AliExpressApiClientService.fromEnv(env);
        apiProfile = await client.getFullProductProfile(productId);
        enriched = mergeApiProfile(enriched, apiProfile);

        if (apiProfile.reviews != null && apiProfile.rating != null) {
          const breakdown = estimateReviewBreakdown(
            apiProfile.reviews,
            apiProfile.rating,
          );
          if (breakdown) {
            enriched.negativeRateEstimate = breakdown.negativeRatePercent;
          }
        }
        sources.push("api");
      } catch (err) {
        console.warn("listing API enrichment failed", productId, err);
      }
    }
  }

  enriched = applyDiscoveryScores(enriched);

  return { listing: enriched, sources, apiProfile };
}
