import type {
  AliExpressProduct,
  AliExpressSearchResult,
  Env,
  ImportProductInput,
  ImportProductResult,
  ProductSearchFilters,
} from "../types";
import { applyMarkup, clampImages, extractAliExpressId, HttpError } from "../utils/http";
import { AiFilterService } from "./ai-filter";
import { AliExpressService } from "./aliexpress";
import { ShopifyService } from "./shopify";
import { SupabaseService } from "./supabase";

/**
 * End-to-end orchestration:
 * AliExpress scrape → AI filter → Supabase upsert → Shopify create → sync log
 */
export class ImportPipeline {
  private aliexpress = new AliExpressService();
  private ai: AiFilterService;
  private shopify: ShopifyService;
  private db: SupabaseService;
  private markup: number;
  private maxImages: number;

  constructor(private env: Env) {
    this.ai = new AiFilterService(env);
    this.shopify = new ShopifyService(env);
    this.db = new SupabaseService(env);
    this.markup = Number(env.DEFAULT_MARKUP ?? "1.4") || 1.4;
    this.maxImages = Number(env.MAX_PRODUCT_IMAGES ?? "8") || 8;
  }

  async searchProducts(
    filters: ProductSearchFilters,
  ): Promise<AliExpressSearchResult> {
    return this.aliexpress.search(filters);
  }

  private async resolveProduct(input: ImportProductInput): Promise<AliExpressProduct> {
    if (input.listing) {
      return this.aliexpress.fromListing(input.listing);
    }

    const source = input.url ?? input.aliexpressId;
    if (!source) {
      throw new HttpError(400, "Provide url, aliexpressId, or listing");
    }

    try {
      return await this.aliexpress.fetchProduct(source);
    } catch (err) {
      // Last resort: minimal listing from id so dashboard import still works
      const id = extractAliExpressId(source);
      if (!id) throw err;
      return this.aliexpress.fromListing({
        aliexpressId: id,
        title: `AliExpress Product ${id}`,
        url: this.aliexpress.buildProductUrl(id),
        image: "",
        images: [],
        originalPrice: 0,
        currency: "USD",
      });
    }
  }

  async importProduct(input: ImportProductInput): Promise<ImportProductResult> {
    const scraped = await this.resolveProduct(input);
    const sellingPrice =
      input.sellingPrice ??
      applyMarkup(scraped.originalPrice, input.markup ?? this.markup);

    const filter = input.force
      ? {
          approved: true,
          score: 1,
          reason: "force=true",
          suggestedTitle: scraped.title,
          tags: ["forced"],
        }
      : await this.ai.evaluate(scraped);

    const images = clampImages(scraped.images, this.maxImages);

    let product = await this.db.upsertProduct({
      aliexpress_id: scraped.aliexpressId,
      title: filter.suggestedTitle || scraped.title,
      original_price: scraped.originalPrice,
      selling_price: sellingPrice,
      images,
      status: filter.approved ? "approved" : "filtered_out",
      description_html: scraped.descriptionHtml,
      currency: scraped.currency,
      metadata: {
        url: scraped.url,
        attributes: scraped.attributes,
        variantCount: scraped.variants.length,
        filter,
      },
    });

    if (!filter.approved) {
      await this.db.createSyncLog({
        product_id: product.id,
        aliexpress_id: product.aliexpress_id,
        action: "ai_filter",
        status: "failed",
        request_payload: { title: scraped.title },
        response_payload: filter as unknown as Record<string, unknown>,
        error_message: filter.reason,
      });

      return { product, filter, synced: false };
    }

    try {
      const created = await this.shopify.createProductFromAliExpress({
        product: {
          ...scraped,
          title: product.title,
          images,
        },
        sellingPrice,
        tags: filter.tags,
      });

      product = await this.db.updateProductStatus(product.id, "synced", {
        shopify_product_id: created.id,
        shopify_handle: created.handle,
        selling_price: sellingPrice,
      });

      await this.db.createSyncLog({
        product_id: product.id,
        aliexpress_id: product.aliexpress_id,
        shopify_product_id: created.id,
        action: "shopify_product_create",
        status: "success",
        request_payload: {
          aliexpressId: scraped.aliexpressId,
          sellingPrice,
        },
        response_payload: {
          id: created.id,
          handle: created.handle,
        },
      });

      return {
        product,
        filter,
        shopify: { productId: created.id, handle: created.handle },
        synced: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Shopify sync failed";
      const details =
        err instanceof HttpError ? err.details : undefined;

      product = await this.db.updateProductStatus(product.id, "failed");

      await this.db.createSyncLog({
        product_id: product.id,
        aliexpress_id: product.aliexpress_id,
        action: "shopify_product_create",
        status: "failed",
        request_payload: {
          aliexpressId: scraped.aliexpressId,
          sellingPrice,
        },
        response_payload:
          details && typeof details === "object"
            ? (details as Record<string, unknown>)
            : { details },
        error_message: message,
      });

      throw err;
    }
  }

  async preview(input: ImportProductInput) {
    return this.resolveProduct(input);
  }

  get dbService() {
    return this.db;
  }
}
