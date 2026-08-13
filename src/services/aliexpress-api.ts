import type { Env } from "../types";
import { ALIEXPRESS_BUSINESS_REST_BASE } from "../constants/aliexpress";
import { signAliExpressRequest } from "../utils/aliexpress-sign";
import {
  extractAliExpressApiError,
  isAliExpressAuthError,
} from "../utils/aliexpress-api-error";
import { fetchWithTimeout, HttpError } from "../utils/http";
import { sleep } from "../utils/rate-limiter";
import type { AliExpressCredentials } from "./aliexpress-credentials";
import { loadAliExpressCredentials } from "./aliexpress-credentials";
import { SupabaseService } from "./supabase";

/** AliExpress Open Platform — signed server-to-server transport */
const API_BASE = "https://api-sg.aliexpress.com";
const REST_BASE = `${API_BASE}/rest`;
const BUSINESS_REST_BASE = ALIEXPRESS_BUSINESS_REST_BASE;
const OAUTH_AUTHORIZE = `${API_BASE}/oauth/authorize`;

const DEFAULT_SHIP_TO = "SA";
const SEARCH_CURRENCY = "USD";
const SHIPPING_CURRENCY = "SAR";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 650;
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AliExpressTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expire_time?: string | number;
  expires_in?: string | number;
  refresh_expires_in?: string | number;
  code?: string;
  message?: string;
  request_id?: string;
};

export type AliExpressFreightOption = {
  serviceName: string;
  estimatedDeliveryTime?: string;
  amount?: number;
  currency?: string;
  trackingAvailable?: boolean;
};

/** نتيجة البحث — الحقول المطلوبة للداشبورد */
export type AliExpressSearchProduct = {
  product_id: string;
  title: string;
  price: number;
  sales?: number;
  rating?: number;
  reviews?: number;
  image_url: string;
  link: string;
};

/** تفاصيل المنتج الكاملة من DS API */
export type AliExpressProductDetails = {
  product_id: string;
  title: string;
  description?: string;
  price: number;
  list_price?: number;
  currency: string;
  sales?: number;
  rating?: number;
  reviews?: number;
  images: string[];
  link: string;
  category_id?: string;
  store?: { id?: string; name?: string; rating?: number };
  attributes: Array<{ name: string; value: string }>;
  variants: Array<{
    sku_id?: string;
    title: string;
    price: number;
    currency: string;
    available: boolean;
    stock?: number;
    image?: string;
  }>;
  raw?: Record<string, unknown>;
};

/** تكلفة الشحن للسعودية */
export type AliExpressShippingCost = {
  product_id: string;
  quantity: number;
  cost: number;
  currency: string;
  estimated_delivery_days?: string;
  service_name: string;
  tracking_available?: boolean;
  all_options: AliExpressFreightOption[];
};

type CacheEntry<T> = { expiresAt: number; value: T };

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const row = this.store.get(key);
    if (!row || Date.now() > row.expiresAt) {
      if (row) this.store.delete(key);
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
    const gap = this.lastAt + MIN_REQUEST_GAP_MS - Date.now();
    if (gap > 0) await sleep(gap);
    this.lastAt = Date.now();
  }
}

/**
 * AliExpress DropShip API — توقيع Server-to-Server + استدعاءات عالية المستوى.
 *
 * ملاحظة مهمة: App Key + App Secret يوقّعان الطلب فقط.
 * واجهات DropShip (منتجات/شحن) تحتاج `access_token` من OAuth على بوابة `/rest`.
 * ضع ALIEXPRESS_ACCESS_TOKEN في env أو اربط OAuth مرة واحدة.
 */
export class AliExpressApi {
  private readonly cache = new MemoryCache();
  private readonly limiter = new ApiRateLimiter();

  constructor(
    private readonly creds: AliExpressCredentials,
    private readonly env?: Env,
  ) {}

  static async fromEnv(env: Env): Promise<AliExpressApi> {
    const creds = await loadAliExpressCredentials(env);
    if (!creds) {
      throw new HttpError(
        500,
        "AliExpress API غير مضبوط — أضف ALIEXPRESS_APP_KEY و ALIEXPRESS_APP_SECRET",
      );
    }
    return new AliExpressApi(creds, env);
  }

  // -------------------------------------------------------------------------
  // 1) searchProducts
  // -------------------------------------------------------------------------

  /**
   * بحث المنتجات بالكلمة — يستخدم aliexpress.ds.product.search (الطريقة الصحيحة).
   * recommend feed لا يدعم keyword وغالباً يرجع 0 منتجات.
   */
  async searchProducts(
    keyword: string,
    pageNumber = 1,
  ): Promise<AliExpressSearchProduct[]> {
    const q = keyword.trim();
    if (q.length < 2) return [];

    const fromKeyword = await this.searchProductsByKeyword(q, pageNumber).catch(
      () => [] as AliExpressSearchProduct[],
    );
    if (fromKeyword.length > 0) return fromKeyword;

    return this.fetchRecommendFeed({
      keyword: q,
      pages: 1,
      pageStart: pageNumber,
      strictKeyword: false,
    });
  }

  /** DS keyword search — aliexpress.ds.product.search */
  async searchProductsByKeyword(
    keyword: string,
    pageNumber = 1,
    pageSize = 50,
  ): Promise<AliExpressSearchProduct[]> {
    this.requireAccessToken();
    const q = keyword.trim();
    if (q.length < 2) return [];

    const page = Math.max(pageNumber, 1);
    const size = Math.min(Math.max(pageSize, 10), 50);
    const cacheKey = `kwsearch:${q}:${page}:${size}`;
    const cached = this.cache.get<AliExpressSearchProduct[]>(cacheKey);
    if (cached) return cached;

    const raw = await this.callSync("aliexpress.ds.product.search", {
      keywords: q,
      page_no: String(page),
      page_size: String(size),
      ship_to_country: DEFAULT_SHIP_TO,
      target_currency: SEARCH_CURRENCY,
      target_language: "EN",
      sort: "SALE_PRICE_ASC",
    });

    const mapped = this.extractSearchProducts(raw)
      .map((item) => this.mapSearchRow(item))
      .filter((row) => row.product_id);

    await this.log("aliexpress_api:keyword_search", {
      keyword: q,
      page,
      result_count: mapped.length,
    });

    if (mapped.length > 0) {
      this.cache.set(cacheKey, mapped, CACHE_TTL_MS);
    }
    return mapped;
  }

  /**
   * DS recommend feeds — مكمّل فقط عندما keyword search لا يكفي.
   */
  async fetchRecommendFeed(options?: {
    keyword?: string;
    pages?: number;
    pageStart?: number;
    pageSize?: number;
    feedNames?: string[];
    /** When false, keyword only boosts ranking instead of hard-filtering */
    strictKeyword?: boolean;
  }): Promise<AliExpressSearchProduct[]> {
    const keyword = options?.keyword?.trim() ?? "";
    const pages = Math.min(Math.max(options?.pages ?? 3, 1), 8);
    const pageStart = Math.max(options?.pageStart ?? 1, 1);
    const pageSize = Math.min(Math.max(options?.pageSize ?? 50, 10), 50);
    const feedNames = options?.feedNames?.length
      ? options.feedNames
      : ["DS bestseller", "DS new arrival", "DS hot product"];
    const strictKeyword = options?.strictKeyword ?? Boolean(keyword);

    const cacheKey = `feed:${keyword}:${pages}:${pageStart}:${feedNames.join(",")}:${strictKeyword}`;
    const cached = this.cache.get<AliExpressSearchProduct[]>(cacheKey);
    if (cached) return cached;

    const byId = new Map<string, AliExpressSearchProduct>();

    for (const feedName of feedNames) {
      for (let offset = 0; offset < pages; offset += 1) {
        const pageNo = pageStart + offset;
        const raw = await this.callSync("aliexpress.ds.recommend.feed.get", {
          feed_name: feedName,
          country: DEFAULT_SHIP_TO,
          target_currency: SEARCH_CURRENCY,
          target_language: "EN",
          page_size: String(pageSize),
          page_no: String(pageNo),
          sort: "volumeDesc",
        });

        for (const item of this.extractFeedProducts(raw)) {
          const mapped = this.mapSearchRow(item);
          if (!mapped.product_id) continue;
          byId.set(mapped.product_id, mapped);
        }
      }
    }

    let mapped = [...byId.values()];
    if (keyword) {
      mapped = mapped
        .map((row) => ({
          row,
          relevance: keywordRelevanceScore(row.title, keyword),
        }))
        .filter(({ relevance }) => !strictKeyword || relevance >= 0.35)
        .sort((a, b) => b.relevance - a.relevance)
        .map(({ row }) => row);
    }

    await this.log("aliexpress_api:feed", {
      keyword: keyword || null,
      pages,
      result_count: mapped.length,
    });

    if (mapped.length > 0) {
      this.cache.set(cacheKey, mapped, CACHE_TTL_MS);
    }
    return mapped;
  }

  // -------------------------------------------------------------------------
  // 2) getProductDetails
  // -------------------------------------------------------------------------

  async getProductDetails(productId: string): Promise<AliExpressProductDetails> {
    const id = productId.trim();
    if (!id) throw new HttpError(400, "productId مطلوب");

    const cacheKey = `product:${id}`;
    const cached = this.cache.get<AliExpressProductDetails>(cacheKey);
    if (cached) return cached;

    const raw = await this.callSync("aliexpress.ds.product.get", {
      product_id: id,
      ship_to_country: DEFAULT_SHIP_TO,
      target_currency: SEARCH_CURRENCY,
      target_language: "EN",
    });

    const details = this.parseProductDetails(raw, id);
    await this.log("aliexpress_api:product", { product_id: id });
    this.cache.set(cacheKey, details);
    return details;
  }

  // -------------------------------------------------------------------------
  // 3) getShippingCost
  // -------------------------------------------------------------------------

  async getShippingCost(
    productId: string,
    quantity = 1,
  ): Promise<AliExpressShippingCost> {
    const id = productId.trim();
    const qty = Math.max(1, Math.min(quantity, 99));
    if (!id) throw new HttpError(400, "productId مطلوب");

    const cacheKey = `freight:${id}:${qty}`;
    const cached = this.cache.get<AliExpressShippingCost>(cacheKey);
    if (cached) return cached;

    const options = await this.calculateFreight({
      productId: id,
      quantity: qty,
      shipToCountry: DEFAULT_SHIP_TO,
    });

    if (!options.length) {
      throw new HttpError(502, "لم يُرجع AliExpress خيارات شحن للسعودية");
    }

    const cheapest = [...options].sort(
      (a, b) => (a.amount ?? 0) - (b.amount ?? 0),
    )[0]!;

    const result: AliExpressShippingCost = {
      product_id: id,
      quantity: qty,
      cost: cheapest.amount ?? 0,
      currency: cheapest.currency ?? SHIPPING_CURRENCY,
      estimated_delivery_days: cheapest.estimatedDeliveryTime,
      service_name: cheapest.serviceName,
      tracking_available: cheapest.trackingAvailable,
      all_options: options,
    };

    await this.log("aliexpress_api:shipping", {
      product_id: id,
      quantity: qty,
      cost: result.cost,
      service: result.service_name,
    });

    this.cache.set(cacheKey, result, 30 * 60 * 1000);
    return result;
  }

  // -------------------------------------------------------------------------
  // Transport — signed requests (App Key + Secret [+ session])
  // -------------------------------------------------------------------------

  async callSync(
    method: string,
    apiParams: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    return this.request(method, apiParams);
  }

  async calculateFreight(input: {
    productId: string;
    quantity?: number;
    shipToCountry?: string;
    provinceCode?: string;
    cityCode?: string;
    price?: string;
  }): Promise<AliExpressFreightOption[]> {
    this.requireAccessToken();

    const payload = {
      country_code: (input.shipToCountry || DEFAULT_SHIP_TO).toUpperCase(),
      product_id: input.productId,
      product_num: input.quantity ?? 1,
      ...(input.provinceCode ? { province_code: input.provinceCode } : {}),
      ...(input.cityCode ? { city_code: input.cityCode } : {}),
      ...(input.price ? { price: input.price } : {}),
    };

    const raw = await this.callSync(
      "aliexpress.logistics.buyer.freight.calculate",
      {
        param_aeop_freight_calculate_for_buyer_d_t_o: JSON.stringify(payload),
      },
    );

    return this.parseFreightResponse(raw);
  }

  // OAuth helpers (للربط الاختياري)
  buildAuthorizeUrl(state?: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.creds.appKey,
      redirect_uri: this.creds.callbackUrl,
      force_auth: "true",
    });
    if (state) params.set("state", state);
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  }

  async createTokenFromCode(code: string): Promise<AliExpressTokenResponse> {
    const trimmed = code.trim();
    const paths = [
      { path: "/auth/token/security/create", extra: { uuid: crypto.randomUUID() } },
      { path: "/auth/token/create", extra: {} },
    ];
    let lastError: unknown;
    for (const { path, extra } of paths) {
      try {
        return await this.callRest(path, { code: trimmed, ...extra });
      } catch (err) {
        lastError = err;
        if (!(err instanceof HttpError) || err.status !== 502) throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new HttpError(502, "فشل استبدال الكود");
  }

  async refreshToken(
    refreshToken?: string | null,
  ): Promise<AliExpressTokenResponse> {
    const token = refreshToken ?? this.creds.refreshToken;
    if (!token) {
      throw new HttpError(400, "لا يوجد refresh token");
    }
    const paths = [
      "/auth/token/security/refresh",
      "/auth/token/refresh",
    ];
    let lastError: unknown;
    for (const path of paths) {
      try {
        return await this.callRest(path, { refresh_token: token });
      } catch (err) {
        lastError = err;
        if (!(err instanceof HttpError) || err.status !== 502) throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new HttpError(502, "فشل تجديد التوكن");
  }

  private async request(
    method: string,
    apiParams: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        await this.limiter.wait();
        return await this.signedBusinessCall(method, apiParams);
      } catch (err) {
        lastError = err;
        const retryable =
          err instanceof HttpError &&
          (err.status === 429 || err.status >= 500 || err.status === 408);
        if (!retryable || attempt === MAX_RETRIES - 1) break;
        await sleep(400 * 2 ** attempt);
      }
    }
    throw lastError;
  }

  private async signedBusinessCall(
    method: string,
    apiParams: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const timestamp = String(Date.now());
    const params: Record<string, string> = {
      app_key: this.creds.appKey,
      timestamp,
      sign_method: "sha256",
      method,
      ...apiParams,
    };
    if (this.creds.accessToken) {
      params.access_token = this.creds.accessToken;
    }
    params.sign = await signAliExpressRequest(method, params, this.creds.appSecret);

    const body = new URLSearchParams(params);
    const res = await fetchWithTimeout(BUSINESS_REST_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body,
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const error = extractAliExpressApiError(json);

    if (res.status === 429) {
      throw new HttpError(429, "AliExpress rate limit — جرّب لاحقاً", json);
    }

    if (!res.ok || error) {
      const msg = error?.sub_msg || error?.msg || "AliExpress API request failed";
      const needsAuth = isAliExpressAuthError(msg);
      throw new HttpError(
        needsAuth ? 401 : 502,
        needsAuth
          ? `${msg} — أضف ALIEXPRESS_ACCESS_TOKEN أو اربط OAuth`
          : msg,
        json,
      );
    }

    return json;
  }

  private async callRest(
    apiPath: string,
    apiParams: Record<string, string>,
  ): Promise<AliExpressTokenResponse> {
    const timestamp = String(Date.now());
    const params: Record<string, string> = {
      app_key: this.creds.appKey,
      timestamp,
      sign_method: "sha256",
      ...apiParams,
    };
    params.sign = await signAliExpressRequest(apiPath, params, this.creds.appSecret);

    const body = new URLSearchParams(params);
    const res = await fetchWithTimeout(`${REST_BASE}${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body,
    });

    const json = (await res.json().catch(() => ({}))) as AliExpressTokenResponse & {
      error_response?: { msg?: string; sub_msg?: string; code?: number };
    };

    if (!res.ok) {
      throw new HttpError(
        502,
        json.error_response?.sub_msg ||
          json.error_response?.msg ||
          json.message ||
          "AliExpress token request failed",
        json,
      );
    }

    if (json.code && json.code !== "0" && !json.access_token) {
      throw new HttpError(502, json.message || "AliExpress token request failed", json);
    }

    return json;
  }

  protected requireAccessToken(): void {
    if (!this.creds.accessToken) {
      throw new HttpError(
        401,
        "AliExpress يحتاج access token — ضع ALIEXPRESS_ACCESS_TOKEN في env أو /api/auth/aliexpress/connect",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Parsing
  // -------------------------------------------------------------------------

  private extractFeedProducts(raw: Record<string, unknown>): Record<string, unknown>[] {
    const response =
      (raw.aliexpress_ds_recommend_feed_get_response as Record<string, unknown>) || raw;
    const result = (response.result as Record<string, unknown>) || response;
    return this.normalizeProductList(result);
  }

  private extractSearchProducts(raw: Record<string, unknown>): Record<string, unknown>[] {
    const response =
      (raw.aliexpress_ds_product_search_response as Record<string, unknown>) || raw;
    const result = (response.result as Record<string, unknown>) || response;
    return this.normalizeProductList(result);
  }

  private normalizeProductList(
    result: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const candidates: unknown[] = [];
    const products = result.products;
    if (Array.isArray(products)) {
      candidates.push(...products);
    } else if (products && typeof products === "object") {
      const node = products as Record<string, unknown>;
      for (const key of ["product", "aeop_ae_product_display_dto", "traffic_product_d_t_o"]) {
        const nested = node[key];
        if (Array.isArray(nested)) candidates.push(...nested);
      }
    }
    if (Array.isArray(result.product_list)) candidates.push(...result.product_list);
    if (Array.isArray(result.aeop_ae_product_display_dto_list)) {
      candidates.push(...result.aeop_ae_product_display_dto_list);
    }
    return candidates.filter(
      (row): row is Record<string, unknown> => !!row && typeof row === "object",
    );
  }

  private mapSearchRow(item: Record<string, unknown>): AliExpressSearchProduct {
    const product_id = String(
      item.product_id ?? item.productId ?? item.item_id ?? item.id ?? "",
    );
    const title = String(item.product_title ?? item.title ?? item.subject ?? "Untitled");
    const price = toNumber(item.sale_price ?? item.target_sale_price ?? item.price, 0);
    const image_url = String(
      item.product_main_image_url ?? item.image_url ?? item.main_image ?? "",
    );
    const link =
      String(item.product_detail_url ?? item.detail_url ?? "") ||
      `https://www.aliexpress.com/item/${product_id}.html`;

    return {
      product_id,
      title,
      price,
      sales: toOptionalNumber(item.volume ?? item.sold_count ?? item.orders),
      rating: toOptionalNumber(item.evaluate_rate ?? item.avg_rating ?? item.rating),
      reviews: toOptionalNumber(item.review_count ?? item.feedback_count ?? item.reviews),
      image_url,
      link,
    };
  }

  private parseProductDetails(
    raw: Record<string, unknown>,
    productId: string,
  ): AliExpressProductDetails {
    const response =
      (raw.aliexpress_ds_product_get_response as Record<string, unknown>) || raw;
    const result = (response.result as Record<string, unknown>) || response;
    const base = (result.ae_item_base_info_dto as Record<string, unknown>) || result;
    const storeNode = (result.ae_store_info as Record<string, unknown>) || {};

    const title = String(base.subject ?? result.subject ?? result.title ?? "Untitled");
    const currency = String(base.currency_code ?? result.currency_code ?? SEARCH_CURRENCY);
    const images = extractImages(result);
    const link = `https://www.aliexpress.com/item/${productId}.html`;

    const skuNodes =
      (result.ae_item_sku_info_dtos as Record<string, unknown>[]) ||
      (result.sku_info_list as Record<string, unknown>[]) ||
      [];

    const listPrice = pickListPrice(skuNodes, base, result);
    const price = pickSalePrice(skuNodes, base, result, listPrice);

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

    const variants = skuNodes.map((sku) => {
      const props = (sku.aeop_s_k_u_propertys as Record<string, unknown>[]) || [];
      const label = props
        .map((p) => String(p.sku_property_value ?? ""))
        .filter(Boolean)
        .join(" / ");
      const stock = toOptionalNumber(
        sku.sku_available_stock ?? sku.s_k_u_available_stock ?? sku.ipm_sku_stock,
      );
      return {
        sku_id: sku.id ? String(sku.id) : undefined,
        title: String(label || sku.sku_attr || "Default"),
        price: toNumber(sku.offer_sale_price ?? sku.sku_price, price),
        currency,
        available: stock != null ? stock > 0 : sku.sku_stock !== false,
        stock: stock ?? undefined,
        image: props.find((p) => p.sku_image)?.sku_image
          ? String(props.find((p) => p.sku_image)!.sku_image)
          : undefined,
      };
    });

    return {
      product_id: productId,
      title,
      description: base.detail ? String(base.detail) : undefined,
      price,
      list_price: listPrice,
      currency,
      sales: toOptionalNumber(
        base.sales_count ?? result.sales_count ?? result.lastest_volume,
      ),
      rating: toOptionalNumber(
        base.avg_evaluation_rating ?? result.avg_evaluation_rating,
      ),
      reviews: toOptionalNumber(base.evaluation_count ?? result.evaluation_count),
      images,
      link,
      category_id:
        base.category_id != null ? String(base.category_id) : undefined,
      store: storeNode.store_name
        ? {
            id: storeNode.store_id != null ? String(storeNode.store_id) : undefined,
            name: String(storeNode.store_name),
            rating: toOptionalNumber(storeNode.item_as_described_rating),
          }
        : undefined,
      attributes,
      variants: variants.length
        ? variants
        : [{ title: "Default", price, currency, available: true }],
      raw,
    };
  }

  private parseFreightResponse(raw: Record<string, unknown>): AliExpressFreightOption[] {
    const response =
      (raw.aliexpress_logistics_buyer_freight_calculate_response as Record<string, unknown>) ||
      (raw.result as Record<string, unknown>) ||
      raw;
    const result = (response.result as Record<string, unknown>) || response;
    const list =
      (result.aeop_freight_calculate_result_for_buyer_d_t_o_list as unknown[]) ||
      (result.aeop_freight_calculate_result_list as unknown[]) ||
      [];

    return list
      .map((item) => {
        const row = item as Record<string, unknown>;
        const freight = (row.freight as Record<string, unknown>) || {};
        return {
          serviceName: String(
            row.service_name || row.logistics_service_name || row.company || "unknown",
          ),
          estimatedDeliveryTime: row.estimated_delivery_time
            ? String(row.estimated_delivery_time)
            : undefined,
          amount: freight.amount != null ? Number(freight.amount) : undefined,
          currency: freight.currency_code ? String(freight.currency_code) : SHIPPING_CURRENCY,
          trackingAvailable:
            row.tracking_available === true || row.tracking_available === "true",
        } satisfies AliExpressFreightOption;
      })
      .filter((row) => row.serviceName !== "unknown" || row.amount != null);
  }

  private async log(
    action: string,
    payload: Record<string, unknown>,
    status: "success" | "failed" = "success",
    errorMessage?: string,
  ): Promise<void> {
    if (!this.env?.SUPABASE_URL) return;
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
      // لا نوقف الطلب إذا فشل التسجيل
    }
  }
}

/** @deprecated استخدم AliExpressApi — محفوظ للتوافق مع الكود القديم */
export class AliExpressApiClient extends AliExpressApi {
  constructor(creds: AliExpressCredentials) {
    super(creds);
  }

  async getProduct(
    productId: string,
    shipToCountry = DEFAULT_SHIP_TO,
    targetCurrency = SEARCH_CURRENCY,
  ) {
    this.requireAccessToken();
    return this.callSync("aliexpress.ds.product.get", {
      product_id: productId,
      ship_to_country: shipToCountry,
      target_currency: targetCurrency,
      target_language: "EN",
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** 0–1 relevance between product title and search keyword (token overlap). */
export function keywordRelevanceScore(title: string, keyword: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]+/g, " ")
      .trim();
  const titleHay = norm(title);
  const phrase = norm(keyword);
  if (!phrase) return 1;
  if (titleHay.includes(phrase)) return 1;

  const tokens = phrase.split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return 1;

  let hits = 0;
  for (const token of tokens) {
    if (titleHay.includes(token)) hits += 1;
  }
  if (hits === 0) return 0;
  return Math.max(hits / tokens.length, 0.25);
}

function extractImages(node: Record<string, unknown>): string[] {
  const gallery =
    (node.ae_multimedia_info_dto as Record<string, unknown>)?.image_urls ||
    node.product_main_image_url;
  if (typeof gallery === "string") {
    return gallery
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (Array.isArray(gallery)) return gallery.map(String).filter(Boolean);
  return [];
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
    base.sale_price ?? base.target_sale_price ?? result.sale_price,
    0,
  );
  return direct > 0 ? direct : (listPrice ?? 0);
}

function pickListPrice(
  skuNodes: Record<string, unknown>[],
  base: Record<string, unknown>,
  result: Record<string, unknown>,
): number | undefined {
  const skuList = skuNodes
    .map((sku) => toNumber(sku.sku_price, NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (skuList.length) return Math.max(...skuList);
  return toOptionalNumber(base.original_price ?? result.original_price);
}

// expose for tests
export const __testables = {
  toNumber,
  toOptionalNumber,
  extractImages,
  pickSalePrice,
  pickListPrice,
};
