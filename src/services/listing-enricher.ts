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

function mergeApiProfile(
  listing: AliExpressListing,
  profile: AliExpressApiProductDetails,
): AliExpressListing {
  const shipping = profile.shippingToSaudi ?? profile.shippingOptions[0];

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
    reviewCount: profile.reviews ?? listing.reviewCount,
    rating: profile.rating ?? listing.rating,
    discountPercent: profile.discountPercent ?? listing.discountPercent,
    images,
    image: images[0] || listing.image,
    badges: profile.badges.length ? profile.badges : listing.badges,
    shippingCost: shipping?.amount ?? listing.shippingCost,
    shippingCostCurrency: shipping?.currency ?? listing.shippingCostCurrency,
    deliveryEstimate:
      shipping?.estimatedDeliveryDays?.toString() ?? listing.deliveryEstimate,
    isFreeShipping:
      shipping?.amount === 0 ? true : listing.isFreeShipping,
    suspiciousMetrics: profile.suspiciousMetrics ?? listing.suspiciousMetrics,
    descriptionEn: profile.description ?? listing.descriptionEn,
    categoryName: profile.categoryName ?? listing.categoryName,
    storeName: profile.store?.name ?? listing.storeName,
    enrichmentSources: [...(listing.enrichmentSources ?? []), "api"],
  };
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
