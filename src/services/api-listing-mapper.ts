import type { AliExpressListing } from "../types";
import type { AliExpressSearchProduct } from "./aliexpress-api";

/** Map official DS API search row → dashboard listing card */
export function mapApiSearchProductToListing(
  row: AliExpressSearchProduct,
  currency = "USD",
): AliExpressListing {
  const images = row.image_url ? [row.image_url] : [];
  return {
    aliexpressId: row.product_id,
    title: row.title,
    url: row.link,
    image: row.image_url,
    images,
    originalPrice: row.price,
    currency: row.currency || currency,
    soldCount: row.sales,
    rating: row.rating,
    reviewCount: row.reviews,
    enrichmentSources: ["api"],
    isViral: (row.sales ?? 0) >= 1000,
    problemSolvingTitle: false,
  };
}
