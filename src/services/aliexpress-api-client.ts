import type { Env } from "../types";
import { HttpError } from "../utils/http";
import { isSuspiciousMetrics } from "../utils/listing-discovery";
import { estimateReviewBreakdown, type ReviewBreakdown } from "../utils/review-breakdown";
import { sleep } from "../utils/rate-limiter";
import { AliExpressApiClient } from "./aliexpress-api";
import { loadAliExpressCredentials } from "./aliexpress-credentials";
import { SupabaseService, type CreateSyncLogInput } from "./supabase";

const SYNC_BASE = "https://api-sg.aliexpress.com/sync";
const DEFAULT_SHIP_TO = "SA";
const DEFAULT_CURRENCY = "SAR";
const DEFAULT_LANGUAGE = "AR";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 650;
const MAX_RETRIES = 3;

export interface AliExpressApiSearchProduct {
  productId: string;
  title: string;
  price: number;
  currency: string;
  sales?: number;
  rating?: number;
  reviews?: number;
  images: string[];
  link: string;
  ai_ready: boolean;
}

export interface AliExpressApiProductDetails {
  productId: string;
  title: string;
  description?: string;
  price: number;
  listPrice?: number;
  discountPercent?: number;
  currency: string;
  sales?: number;
  rating?: number;
  reviews?: number;
  reviewsBreakdown?: ReviewBreakdown | null;
  images: string[];
  link: string;
  categoryId?: string;
  categoryName?: string;
  store?: {
    id?: string;
    name?: string;
    country?: string;
    rating?: number;
  };
  logistics?: {
    shipFromCountry?: string;
    shipToCountry: string;
    packageWeight?: string;
    packageLength?: string;
    packageWidth?: string;
    packageHeight?: string;
    /** Seller processing + dispatch estimate from product API (days). */
    deliveryTimeDays?: number;
  };
  attributes: Array<{ name: string; value: string }>;
  badges: string[];
  variants: Array<{
    skuId?: string;
    title: string;
    price: number;
    currency: string;
    available: boolean;
    stock?: number;
    image?: string;
  }>;
  shippingOptions: AliExpressShippingQuote[];
  shippingToSaudi: AliExpressShippingQuote | null;
  profit: {
    productCost: number;
    shippingCost: number;
    totalCost: number;
    suggestedSellPrice: number;
    markup: number;
    profitAmount: number;
    profitMarginPercent: number;
    currency: string;
  };
  suspiciousMetrics: boolean;
  ai_ready: boolean;
  can_analyze: boolean;
  dataSource: "aliexpress_ds_api";
  raw?: Record<string, unknown>;
}

export interface AliExpressShippingQuote {
  serviceName: string;
  amount: number;
  currency: string;
  estimatedDeliveryDays?: string;
  trackingAvailable?: boolean;
}

export interface AliExpressValidateInput {
  productId?: string;
  title?: string;
  price?: number;
  sales?: number;
  rating?: number;
  reviews?: number;
  images?: string[];
  ai_ready?: boolean;
}

export interface AliExpressValidateResult {
  can_analyze: boolean;
  ai_ready: boolean;
  reasons: string[];
}

type CacheEntry<T> = { expiresAt: number; value: T };

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const row = this.store.get(key);
    if (!row) return null;
    if (Date.now() > row.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return row.value as T;
  }

  set<T>(key: string, value: T, ttlMs = CACHE_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

class ApiRateLimiter {
  private lastAt = 0;

  async wait(): Promise<void> {
    const now = Date.now();
    const gap = this.lastAt + MIN_REQUEST_GAP_MS - now;
    if (gap > 0) await sleep(gap);
    this.lastAt = Date.now();
  }
}

/**
 * High-level AliExpress Dropshipping API client.
 * Uses signed IOP sync calls + optional Supabase audit logs.
 */
export class AliExpressApiClientService {
  private readonly cache = new MemoryCache();
  private readonly limiter = new ApiRateLimiter();
  private readonly markup: number;

  constructor(
    private readonly env: Env,
    private readonly transport: AliExpressApiClient,
    options?: { markup?: number },
  ) {
    this.markup = options?.markup ?? Number(env.DEFAULT_MARKUP || 1.4);
  }

  static async fromEnv(env: Env): Promise<AliExpressApiClientService> {
    const creds = await loadAliExpressCredentials(env);
    if (!creds) {
      throw new HttpError(
        500,
        "AliExpress API credentials missing — configure AppKey/AppSecret",
      );
    }
    return new AliExpressApiClientService(env, new AliExpressApiClient(creds));
  }

  async searchProducts(
    keyword: string,
    category?: string,
  ): Promise<AliExpressApiSearchProduct[]> {
    const q = keyword.trim();
    if (q.length < 2) {
      throw new HttpError(400, "keyword must be at least 2 characters");
    }

    const cacheKey = `search:${q}:${category ?? ""}`;
    const cached = this.cache.get<AliExpressApiSearchProduct[]>(cacheKey);
    if (cached) return cached;

    const params: Record<string, string> = {
      feed_name: "DS bestseller",
      country: DEFAULT_SHIP_TO,
      target_currency: DEFAULT_CURRENCY,
      target_language: DEFAULT_LANGUAGE,
      page_size: "50",
      sort: "volumeDesc",
    };
    if (category?.trim()) params.category_id = category.trim();

    const raw = await this.request("aliexpress.ds.recommend.feed.get", params);
    const items = this.extractFeedProducts(raw);
    const needle = q.toLowerCase();

    const mapped = items
      .map((item) => this.mapSearchProduct(item))
      .filter((p) => p.title.toLowerCase().includes(needle));

    await this.audit("aliexpress_api:search", {
      keyword: q,
      category: category ?? null,
      endpoint: SYNC_BASE,
      result_count: mapped.length,
    });

    this.cache.set(cacheKey, mapped);
    return mapped;
  }

  async getProductDetails(productId: string): Promise<AliExpressApiProductDetails> {
    return this.getFullProductProfile(productId);
  }

  /** Complete official DS API profile for a single product (SA defaults). */
  async getFullProductProfile(productId: string): Promise<AliExpressApiProductDetails> {
    const id = productId.trim();
    if (!id) throw new HttpError(400, "productId is required");

    const cacheKey = `profile:${id}`;
    const cached = this.cache.get<AliExpressApiProductDetails>(cacheKey);
    if (cached) return cached;

    const raw = await this.request("aliexpress.ds.product.get", {
      product_id: id,
      ship_to_country: DEFAULT_SHIP_TO,
      target_currency: DEFAULT_CURRENCY,
      target_language: DEFAULT_LANGUAGE,
    });

    const product = this.parseProductNode(raw);
    const shippingOptions = await this.getAllShippingOptions(id, 1).catch(() => []);
    const shipping = shippingOptions[0] ?? null;
    const totalCost = product.price + (shipping?.amount ?? 0);
    const suggestedSellPrice = roundMoney(totalCost * this.markup);
    const profitAmount = roundMoney(suggestedSellPrice - totalCost);
    const profitMarginPercent =
      suggestedSellPrice > 0
        ? roundMoney((profitAmount / suggestedSellPrice) * 100)
        : 0;

    const validation = this.validateProduct({
      title: product.title,
      price: product.price,
      sales: product.sales,
      rating: product.rating,
      reviews: product.reviews,
      images: product.images,
    });

    const details: AliExpressApiProductDetails = {
      ...product,
      shippingOptions,
      shippingToSaudi: shipping,
      suspiciousMetrics: validation.reasons.includes("suspicious_metrics"),
      ai_ready: validation.ai_ready,
      can_analyze: validation.can_analyze,
      dataSource: "aliexpress_ds_api",
      profit: {
        productCost: product.price,
        shippingCost: shipping?.amount ?? 0,
        totalCost: roundMoney(totalCost),
        suggestedSellPrice,
        markup: this.markup,
        profitAmount,
        profitMarginPercent,
        currency: product.currency,
      },
      raw,
    };

    await this.audit("aliexpress_api:product_profile", {
      product_id: id,
      endpoint: SYNC_BASE,
      shipping_options: shippingOptions.length,
      sales: product.sales ?? null,
      reviews: product.reviews ?? null,
    });

    this.cache.set(cacheKey, details);
    return details;
  }

  async getAllShippingOptions(
    productId: string,
    quantity: number,
  ): Promise<AliExpressShippingQuote[]> {
    const id = productId.trim();
    const qty = Math.max(1, Math.min(quantity, 99));
    const cacheKey = `freight-all:${id}:${qty}`;
    const cached = this.cache.get<AliExpressShippingQuote[]>(cacheKey);
    if (cached) return cached;

    const options = await this.transport.calculateFreight({
      productId: id,
      quantity: qty,
      shipToCountry: DEFAULT_SHIP_TO,
    });

    const mapped = options
      .map((opt) => ({
        serviceName: opt.serviceName,
        amount: opt.amount ?? 0,
        currency: opt.currency ?? DEFAULT_CURRENCY,
        estimatedDeliveryDays: opt.estimatedDeliveryTime,
        trackingAvailable: opt.trackingAvailable,
      }))
      .sort((a, b) => a.amount - b.amount);

    this.cache.set(cacheKey, mapped, 30 * 60 * 1000);
    return mapped;
  }

  async getShippingCost(
    productId: string,
    quantity: number,
  ): Promise<AliExpressShippingQuote> {
    const options = await this.getAllShippingOptions(productId, quantity);
    if (!options.length) {
      throw new HttpError(502, "No shipping options returned for Saudi Arabia");
    }
    const quote = options[0]!;
    await this.audit("aliexpress_api:shipping", {
      product_id: productId.trim(),
      quantity,
      endpoint: SYNC_BASE,
      service: quote.serviceName,
      amount: quote.amount,
    });
    return quote;
  }

  validateProduct(product: AliExpressValidateInput): AliExpressValidateResult {
    const reasons: string[] = [];
    const title = product.title?.trim() ?? "";
    const price = Number(product.price ?? 0);
    const images = product.images ?? [];
    const sales = product.sales;
    const reviews = product.reviews;
    const rating = product.rating;

    if (title.length < 8) reasons.push("title_too_short");
    if (price <= 0) reasons.push("missing_price");
    if (images.length < 1) reasons.push("missing_images");
    if (sales == null && reviews == null && rating == null) {
      reasons.push("missing_social_proof");
    }

    const suspicious = isSuspiciousMetrics({
      title,
      soldCount: sales,
      reviewCount: reviews,
      rating,
      originalPrice: price,
    });
    if (suspicious) reasons.push("suspicious_metrics");

    const ai_ready =
      product.ai_ready ??
      Boolean(title.length >= 8 && price > 0 && images.length >= 1);

    const can_analyze =
      ai_ready &&
      title.length >= 12 &&
      images.length >= 2 &&
      price > 0 &&
      !suspicious &&
      (reviews != null || rating != null || (sales != null && sales > 0));

    return { can_analyze, ai_ready, reasons };
  }

  private async request(
    method: string,
    apiParams: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        await this.limiter.wait();
        return await this.transport.callSync(method, apiParams);
      } catch (err) {
        lastError = err;
        const retryable =
          err instanceof HttpError &&
          (err.status >= 500 || err.status === 429 || err.status === 408);
        if (!retryable || attempt === MAX_RETRIES - 1) break;
        await sleep(400 * 2 ** attempt);
      }
    }
    throw lastError;
  }

  private extractFeedProducts(raw: Record<string, unknown>): Record<string, unknown>[] {
    const response =
      (raw.aliexpress_ds_recommend_feed_get_response as Record<string, unknown>) || raw;
    const result = (response.result as Record<string, unknown>) || response;
    const list =
      (result.products as unknown[]) ||
      (result.product_list as unknown[]) ||
      (result.aeop_ae_product_display_dto_list as unknown[]) ||
      [];

    return list.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  }

  private mapSearchProduct(item: Record<string, unknown>): AliExpressApiSearchProduct {
    const productId = String(
      item.product_id ?? item.productId ?? item.item_id ?? item.id ?? "",
    );
    const title = String(item.product_title ?? item.title ?? item.subject ?? "Untitled");
    const price = toNumber(item.sale_price ?? item.target_sale_price ?? item.price, 0);
    const currency = String(item.target_currency ?? item.currency ?? DEFAULT_CURRENCY);
    const sales = toOptionalNumber(item.volume ?? item.sold_count ?? item.orders);
    const rating = toOptionalNumber(item.evaluate_rate ?? item.avg_rating ?? item.rating);
    const reviews = toOptionalNumber(item.review_count ?? item.feedback_count ?? item.reviews);
    const image = String(
      item.product_main_image_url ?? item.image_url ?? item.main_image ?? "",
    );
    const images = image ? [image] : extractImages(item);
    const link =
      String(item.product_detail_url ?? item.detail_url ?? "") ||
      `https://www.aliexpress.com/item/${productId}.html`;

    const mapped: AliExpressApiSearchProduct = {
      productId,
      title,
      price,
      currency,
      sales,
      rating,
      reviews,
      images,
      link,
      ai_ready: false,
    };
    mapped.ai_ready = this.validateProduct(mapped).ai_ready;
    return mapped;
  }

  private parseProductNode(raw: Record<string, unknown>): ParsedProductCore {
    const response =
      (raw.aliexpress_ds_product_get_response as Record<string, unknown>) || raw;
    const result = (response.result as Record<string, unknown>) || response;
    const base = (result.ae_item_base_info_dto as Record<string, unknown>) || result;
    const storeNode = (result.ae_store_info as Record<string, unknown>) || {};
    const packageNode = (result.package_info_dto as Record<string, unknown>) || {};
    const logisticsNode = (result.logistics_info_dto as Record<string, unknown>) || {};

    const productId = String(
      base.product_id ?? result.product_id ?? result.item_id ?? "",
    );
    const title = String(base.subject ?? result.subject ?? result.title ?? "Untitled");
    const currency = String(
      base.currency_code ?? result.currency_code ?? DEFAULT_CURRENCY,
    );
    const sales = toOptionalNumber(
      base.sales_count ??
        result.sales_count ??
        result.lastest_volume ??
        result.volume,
    );
    const rating = toOptionalNumber(
      base.avg_evaluation_rating ?? result.avg_evaluation_rating ?? result.evaluate_rate,
    );
    const reviews = toOptionalNumber(
      base.evaluation_count ?? result.evaluation_count ?? result.review_count,
    );
    const images = extractImages(result);
    const link = `https://www.aliexpress.com/item/${productId}.html`;

    const skuNodes =
      (result.ae_item_sku_info_dtos as Record<string, unknown>[]) ||
      (result.sku_info_list as Record<string, unknown>[]) ||
      [];

    const variants = skuNodes.map((sku) => parseSkuVariant(sku, priceFallback(currency, skuNodes, base, result), currency));

    const listPrice = pickListPrice(skuNodes, base, result);
    const price = pickSalePrice(skuNodes, base, result, listPrice);
    const discountPercent =
      listPrice != null && listPrice > price && price > 0
        ? Math.round(((listPrice - price) / listPrice) * 100)
        : undefined;

    const attrNodes =
      (result.ae_item_properties as Record<string, unknown>[]) ||
      (result.ae_item_property_dtos as Record<string, unknown>[]) ||
      [];

    const attributes = attrNodes
      .map((row) => ({
        name: String(row.attr_name ?? row.property_name ?? ""),
        value: String(row.attr_value ?? row.property_value ?? ""),
      }))
      .filter((row) => row.name && row.value);

    const badges = extractBadges(base, result);
    const categoryId =
      base.category_id != null
        ? String(base.category_id)
        : result.category_id != null
          ? String(result.category_id)
          : undefined;

    const storeRating = toOptionalNumber(
      storeNode.item_as_described_rating ??
        storeNode.communication_rating ??
        storeNode.shipping_speed_rating,
    );

    return {
      productId,
      title,
      description: base.detail ? String(base.detail) : undefined,
      price,
      listPrice,
      discountPercent,
      currency,
      sales,
      rating,
      reviews,
      reviewsBreakdown:
        reviews != null && rating != null
          ? estimateReviewBreakdown(reviews, rating)
          : null,
      images,
      link,
      categoryId,
      categoryName: result.category_name ? String(result.category_name) : undefined,
      store: storeNode.store_name
        ? {
            id: storeNode.store_id != null ? String(storeNode.store_id) : undefined,
            name: String(storeNode.store_name),
            rating: storeRating,
          }
        : undefined,
      logistics: {
        shipFromCountry: result.ship_from_country
          ? String(result.ship_from_country)
          : undefined,
        shipToCountry: String(
          logisticsNode.ship_to_country ?? DEFAULT_SHIP_TO,
        ),
        packageWeight:
          packageNode.gross_weight != null
            ? String(packageNode.gross_weight)
            : undefined,
        packageLength:
          packageNode.package_length != null
            ? String(packageNode.package_length)
            : undefined,
        packageWidth:
          packageNode.package_width != null
            ? String(packageNode.package_width)
            : undefined,
        packageHeight:
          packageNode.package_height != null
            ? String(packageNode.package_height)
            : undefined,
        deliveryTimeDays: toOptionalNumber(logisticsNode.delivery_time),
      },
      attributes,
      badges,
      variants: variants.length
        ? variants
        : [{ title: "Default", price, currency, available: true }],
    };
  }

  private async audit(
    action: string,
    payload: Record<string, unknown>,
    status: CreateSyncLogInput["status"] = "success",
    errorMessage?: string,
  ): Promise<void> {
    try {
      const db = new SupabaseService(this.env);
      await db.createSyncLog({
        action,
        status,
        aliexpress_id:
          typeof payload.product_id === "string" ? payload.product_id : null,
        request_payload: payload,
        response_payload: { ok: status === "success" },
        error_message: errorMessage ?? null,
      });
    } catch {
      // Audit must not break API calls when Supabase is unavailable.
    }
  }
}

type ParsedProductCore = Omit<
  AliExpressApiProductDetails,
  | "shippingToSaudi"
  | "profit"
  | "raw"
  | "shippingOptions"
  | "suspiciousMetrics"
  | "ai_ready"
  | "can_analyze"
  | "dataSource"
>;

function parseSkuVariant(
  sku: Record<string, unknown>,
  fallbackPrice: number,
  currency: string,
): AliExpressApiProductDetails["variants"][number] {
  const props = (sku.aeop_s_k_u_propertys as Record<string, unknown>[]) || [];
  const propLabel = props
    .map((p) => String(p.sku_property_value ?? p.property_value_definition_name ?? ""))
    .filter(Boolean)
    .join(" / ");
  const propImage = props.find((p) => p.sku_image)?.sku_image;

  const stock =
    toOptionalNumber(sku.sku_available_stock ?? sku.s_k_u_available_stock ?? sku.ipm_sku_stock) ??
    undefined;

  return {
    skuId: sku.id ? String(sku.id) : sku.sku_id ? String(sku.sku_id) : undefined,
    title: String(
      propLabel || sku.sku_attr || sku.sku_property_name || sku.sku_code || "Default",
    ),
    price: toNumber(sku.offer_sale_price ?? sku.sku_price ?? sku.sale_price, fallbackPrice),
    currency: String(sku.currency_code ?? currency),
    available:
      sku.sku_stock === false
        ? false
        : stock != null
          ? stock > 0
          : sku.sku_stock === true || sku.sku_stock == null,
    stock,
    image: propImage ? String(propImage) : undefined,
  };
}

function priceFallback(
  currency: string,
  skuNodes: Record<string, unknown>[],
  base: Record<string, unknown>,
  result: Record<string, unknown>,
): number {
  if (skuNodes.length) {
    const first = skuNodes[0]!;
    return toNumber(first.offer_sale_price ?? first.sku_price, 0);
  }
  return toNumber(
    base.sale_price ?? base.target_sale_price ?? result.sale_price ?? result.price,
    0,
  );
}

function pickSalePrice(
  skuNodes: Record<string, unknown>[],
  base: Record<string, unknown>,
  result: Record<string, unknown>,
  listPrice?: number,
): number {
  const skuPrices = skuNodes
    .map((sku) => toNumber(sku.offer_sale_price ?? sku.sku_price, NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (skuPrices.length) return Math.min(...skuPrices);

  const direct = toNumber(
    base.sale_price ?? base.target_sale_price ?? result.sale_price ?? result.price,
    0,
  );
  if (direct > 0) return direct;
  return listPrice ?? 0;
}

function pickListPrice(
  skuNodes: Record<string, unknown>[],
  base: Record<string, unknown>,
  result: Record<string, unknown>,
): number | undefined {
  const skuList = skuNodes
    .map((sku) => toNumber(sku.sku_price ?? sku.offer_bulk_sale_price, NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (skuList.length) return Math.max(...skuList);

  const direct = toOptionalNumber(
    base.original_price ?? result.original_price ?? result.list_price,
  );
  return direct;
}

function extractBadges(
  base: Record<string, unknown>,
  result: Record<string, unknown>,
): string[] {
  const badges: string[] = [];
  const status = String(base.product_status_type ?? result.product_status_type ?? "");
  if (/on.?selling|online/i.test(status)) badges.push("on_sale");
  if (result.platform_product_type) badges.push(String(result.platform_product_type));
  if (result.is_choice === true || result.is_choice === "true") badges.push("choice");
  return badges;
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractImages(node: Record<string, unknown>): string[] {
  const fromList =
    (node.image_urls as string[]) ||
    (node.product_images as string[]) ||
    (node.images as string[]) ||
    [];

  if (Array.isArray(fromList) && fromList.length) {
    return fromList.map(String).filter(Boolean).slice(0, 12);
  }

  const gallery =
    (node.ae_multimedia_info_dto as Record<string, unknown>)?.image_urls ||
    node.product_main_image_url;

  if (typeof gallery === "string") {
    return gallery
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (Array.isArray(gallery)) {
    return gallery.map(String).filter(Boolean);
  }

  return [];
}
