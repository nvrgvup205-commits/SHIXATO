import type { Env } from "../types";
import { HttpError } from "../utils/http";
import { isSuspiciousMetrics } from "../utils/listing-discovery";
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
  currency: string;
  sales?: number;
  rating?: number;
  reviews?: number;
  images: string[];
  link: string;
  variants: Array<{
    skuId?: string;
    title: string;
    price: number;
    currency: string;
    available: boolean;
  }>;
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
    const id = productId.trim();
    if (!id) throw new HttpError(400, "productId is required");

    const cacheKey = `product:${id}`;
    const cached = this.cache.get<AliExpressApiProductDetails>(cacheKey);
    if (cached) return cached;

    const raw = await this.request("aliexpress.ds.product.get", {
      product_id: id,
      ship_to_country: DEFAULT_SHIP_TO,
      target_currency: DEFAULT_CURRENCY,
      target_language: DEFAULT_LANGUAGE,
    });

    const product = this.parseProductNode(raw);
    const shipping = await this.getShippingCost(id, 1).catch(() => null);
    const totalCost = product.price + (shipping?.amount ?? 0);
    const suggestedSellPrice = roundMoney(totalCost * this.markup);
    const profitAmount = roundMoney(suggestedSellPrice - totalCost);
    const profitMarginPercent =
      suggestedSellPrice > 0
        ? roundMoney((profitAmount / suggestedSellPrice) * 100)
        : 0;

    const details: AliExpressApiProductDetails = {
      ...product,
      shippingToSaudi: shipping,
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

    await this.audit("aliexpress_api:product_details", {
      product_id: id,
      endpoint: SYNC_BASE,
      shipping_amount: shipping?.amount ?? null,
    });

    this.cache.set(cacheKey, details);
    return details;
  }

  async getShippingCost(
    productId: string,
    quantity: number,
  ): Promise<AliExpressShippingQuote> {
    const id = productId.trim();
    const qty = Math.max(1, Math.min(quantity, 99));
    const cacheKey = `freight:${id}:${qty}`;
    const cached = this.cache.get<AliExpressShippingQuote>(cacheKey);
    if (cached) return cached;

    const options = await this.transport.calculateFreight({
      productId: id,
      quantity: qty,
      shipToCountry: DEFAULT_SHIP_TO,
    });

    if (!options.length) {
      throw new HttpError(502, "No shipping options returned for Saudi Arabia");
    }

    const best = [...options].sort(
      (a, b) => (a.amount ?? Number.POSITIVE_INFINITY) - (b.amount ?? Number.POSITIVE_INFINITY),
    )[0];

    const quote: AliExpressShippingQuote = {
      serviceName: best.serviceName,
      amount: best.amount ?? 0,
      currency: best.currency ?? DEFAULT_CURRENCY,
      estimatedDeliveryDays: best.estimatedDeliveryTime,
      trackingAvailable: best.trackingAvailable,
    };

    await this.audit("aliexpress_api:shipping", {
      product_id: id,
      quantity: qty,
      endpoint: SYNC_BASE,
      service: quote.serviceName,
      amount: quote.amount,
    });

    this.cache.set(cacheKey, quote, 30 * 60 * 1000);
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

  private parseProductNode(raw: Record<string, unknown>): Omit<
    AliExpressApiProductDetails,
    "shippingToSaudi" | "profit" | "raw"
  > {
    const response =
      (raw.aliexpress_ds_product_get_response as Record<string, unknown>) || raw;
    const result = (response.result as Record<string, unknown>) || response;
    const base = (result.ae_item_base_info_dto as Record<string, unknown>) || result;

    const productId = String(
      base.product_id ?? result.product_id ?? result.item_id ?? "",
    );
    const title = String(base.subject ?? result.subject ?? result.title ?? "Untitled");
    const price = toNumber(
      base.sale_price ?? base.target_sale_price ?? result.sale_price ?? result.price,
      0,
    );
    const currency = String(
      base.currency_code ?? result.currency_code ?? DEFAULT_CURRENCY,
    );
    const sales = toOptionalNumber(base.sales_count ?? result.sales_count ?? result.volume);
    const rating = toOptionalNumber(base.avg_evaluation_rating ?? result.evaluate_rate);
    const reviews = toOptionalNumber(base.evaluation_count ?? result.review_count);
    const images = extractImages(result);
    const link = `https://www.aliexpress.com/item/${productId}.html`;

    const skuNodes =
      (result.ae_item_sku_info_dtos as Record<string, unknown>[]) ||
      (result.sku_info_list as Record<string, unknown>[]) ||
      [];

    const variants = skuNodes.map((sku) => ({
      skuId: sku.sku_id ? String(sku.sku_id) : undefined,
      title: String(sku.sku_attr ?? sku.sku_property_name ?? "Default"),
      price: toNumber(sku.sku_price ?? sku.offer_sale_price ?? price, price),
      currency,
      available: sku.sku_stock != null ? Number(sku.sku_stock) > 0 : true,
    }));

    return {
      productId,
      title,
      description: base.detail ? String(base.detail) : undefined,
      price,
      currency,
      sales,
      rating,
      reviews,
      images,
      link,
      variants: variants.length ? variants : [{ title: "Default", price, currency, available: true }],
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
