import type {
  AliExpressListing,
  AliExpressProduct,
  AliExpressSearchResult,
  AliExpressVariant,
} from "../types";
import { extractAliExpressId, fetchWithTimeout, HttpError } from "../utils/http";

/**
 * AliExpress product extractor + search.
 * Search uses wholesale SSR pages (more reliable than PDP).
 * PDP scrape is best-effort; callers can fall back to listing cards.
 */
export class AliExpressService {
  buildProductUrl(aliexpressId: string): string {
    return `https://www.aliexpress.com/item/${aliexpressId}.html`;
  }

  buildSearchUrl(query: string, page = 1): string {
    const slug = query
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const safe = slug || "product";
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(safe)}.html${qs ? `?${qs}` : ""}`;
  }

  async search(query: string, page = 1): Promise<AliExpressSearchResult> {
    const q = query.trim();
    if (q.length < 2) {
      throw new HttpError(400, "Search query must be at least 2 characters");
    }

    const url = this.buildSearchUrl(q, page);
    const html = await this.fetchHtml(url, { allowShort: false });
    const results = this.parseSearchResults(html);

    return { query: q, page, results };
  }

  fromListing(listing: AliExpressListing): AliExpressProduct {
    const id =
      extractAliExpressId(listing.aliexpressId) ||
      extractAliExpressId(listing.url);
    if (!id) {
      throw new HttpError(400, "Listing is missing a valid AliExpress id");
    }

    const images = [
      ...(listing.images ?? []),
      ...(listing.image ? [listing.image] : []),
    ]
      .map((src) => this.normalizeImageUrl(src))
      .filter(Boolean);

    const price =
      Number.isFinite(listing.originalPrice) && listing.originalPrice > 0
        ? listing.originalPrice
        : 0;

    return {
      aliexpressId: id,
      url: listing.url || this.buildProductUrl(id),
      title: listing.title?.trim() || `AliExpress Product ${id}`,
      descriptionHtml: `<p>${this.escapeHtml(listing.title || id)}</p>`,
      currency: listing.currency || "USD",
      originalPrice: price,
      minPrice: price,
      maxPrice: price,
      images: [...new Set(images)],
      variants: [
        {
          sku: "default",
          title: "Default",
          price,
          currency: listing.currency || "USD",
          available: true,
          options: {},
        },
      ],
      attributes: {
        ...(listing.sold ? { sold: listing.sold } : {}),
        ...(listing.rating != null ? { rating: String(listing.rating) } : {}),
        source: "search_listing",
      },
      scrapedAt: new Date().toISOString(),
    };
  }

  async fetchProduct(input: string): Promise<AliExpressProduct> {
    const aliexpressId = extractAliExpressId(input);
    if (!aliexpressId) {
      throw new HttpError(400, "Invalid AliExpress URL or product id");
    }

    const url = this.buildProductUrl(aliexpressId);
    const html = await this.fetchHtml(url);
    if (this.isBlockedPage(html)) {
      throw new HttpError(
        502,
        "AliExpress blocked the product page (anti-bot). Use search + import from listing instead.",
        { aliexpressId, url },
      );
    }

    const raw = this.extractEmbeddedData(html);

    if (!raw) {
      throw new HttpError(
        502,
        "Could not extract product JSON from AliExpress page",
        { aliexpressId, url },
      );
    }

    return this.normalize(aliexpressId, url, raw, html);
  }

  private async fetchHtml(
    url: string,
    options?: { allowShort?: boolean },
  ): Promise<string> {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Upgrade-Insecure-Requests": "1",
        },
        redirect: "follow",
      },
      25_000,
    );

    if (!res.ok) {
      throw new HttpError(502, `AliExpress HTTP ${res.status}`, {
        url,
        status: res.status,
      });
    }

    const html = await res.text();
    if (options?.allowShort === false && html.length < 5_000) {
      throw new HttpError(502, "AliExpress returned an empty/blocked page", {
        url,
        bytes: html.length,
      });
    }
    return html;
  }

  private isBlockedPage(html: string): boolean {
    return (
      html.includes("_____tmd_____/punish") ||
      html.includes("x5secdata") ||
      (html.length < 4_000 && html.includes("sessionStorage.x5referer"))
    );
  }

  private parseSearchResults(html: string): AliExpressListing[] {
    const blob = this.extractBalancedJson(html, '{"appData":');
    if (!blob) return this.parseSearchResultsFallback(html);

    try {
      const data = JSON.parse(blob) as Record<string, unknown>;
      const loaderData = data.loaderData as Record<string, unknown> | undefined;
      const root = loaderData?.["/"] as Record<string, unknown> | undefined;
      const pageData = root?.data as Record<string, unknown> | undefined;
      const searchResult = pageData?.searchResult as
        | Record<string, unknown>
        | undefined;
      const mods = searchResult?.mods as Record<string, unknown> | undefined;
      const itemList = mods?.itemList as Record<string, unknown> | undefined;
      const content = (itemList?.content as Array<Record<string, unknown>>) ?? [];

      return content
        .map((item) => this.listingFromSearchItem(item))
        .filter((x): x is AliExpressListing => Boolean(x));
    } catch {
      return this.parseSearchResultsFallback(html);
    }
  }

  private listingFromSearchItem(
    item: Record<string, unknown>,
  ): AliExpressListing | null {
    const aliexpressId = String(item.productId ?? item.redirectedId ?? "");
    if (!/^\d{6,20}$/.test(aliexpressId)) return null;

    const titleObj = item.title as Record<string, unknown> | undefined;
    const title =
      this.asString(titleObj?.displayTitle) ||
      this.asString(titleObj?.seoTitle) ||
      `Product ${aliexpressId}`;

    const imageObj = item.image as Record<string, unknown> | undefined;
    const image = this.normalizeImageUrl(this.asString(imageObj?.imgUrl));

    const prices = item.prices as Record<string, unknown> | undefined;
    const salePrice = prices?.salePrice as Record<string, unknown> | undefined;
    const originalPriceObj = prices?.originalPrice as
      | Record<string, unknown>
      | undefined;

    let originalPrice = Number(salePrice?.minPrice ?? NaN);
    if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
      originalPrice = Number(originalPriceObj?.minPrice ?? NaN);
    }
    if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
      const extra = item.extraParams as Record<string, unknown> | undefined;
      const cents = Number(extra?.salePriceAmount ?? NaN);
      if (Number.isFinite(cents) && cents > 0) originalPrice = cents / 100;
    }
    if (!Number.isFinite(originalPrice) || originalPrice < 0) originalPrice = 0;

    const currency =
      this.asString(salePrice?.currencyCode) ||
      this.asString(originalPriceObj?.currencyCode) ||
      "USD";

    const trade = item.trade as Record<string, unknown> | undefined;
    const evaluation = item.evaluation as Record<string, unknown> | undefined;
    const detailUrl = this.asString(item.productDetailUrl);
    const url = detailUrl.startsWith("//")
      ? `https:${detailUrl}`
      : detailUrl || this.buildProductUrl(aliexpressId);

    return {
      aliexpressId,
      title,
      url,
      image,
      images: image ? [image] : [],
      originalPrice,
      currency,
      sold: this.asString(trade?.tradeDesc) || undefined,
      rating:
        typeof evaluation?.starRating === "number"
          ? evaluation.starRating
          : undefined,
    };
  }

  private parseSearchResultsFallback(html: string): AliExpressListing[] {
    const ids = [...new Set([...html.matchAll(/\/item\/(\d{6,20})\.html/g)].map((m) => m[1]!))];
    return ids.slice(0, 40).map((aliexpressId) => ({
      aliexpressId,
      title: `AliExpress ${aliexpressId}`,
      url: this.buildProductUrl(aliexpressId),
      image: "",
      images: [],
      originalPrice: 0,
      currency: "USD",
    }));
  }

  private extractBalancedJson(html: string, needle: string): string | null {
    const start = html.indexOf(needle);
    if (start < 0) return null;

    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i]!;
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) return html.slice(start, i + 1);
      }
    }
    return null;
  }

  private extractEmbeddedData(html: string): Record<string, unknown> | null {
    const candidates: Array<() => Record<string, unknown> | null> = [
      () => this.parseScriptAssignment(html, /window\.runParams\s*=\s*(\{[\s\S]*?\});\s*window\.runParams\.csrfToken/),
      () => this.parseScriptAssignment(html, /window\.runParams\s*=\s*(\{[\s\S]*?\});/),
      () => this.parseInitData(html),
      () => this.parseJsonLd(html),
    ];

    for (const tryParse of candidates) {
      try {
        const data = tryParse();
        if (data && Object.keys(data).length > 0) return data;
      } catch {
        // try next strategy
      }
    }
    return null;
  }

  private parseScriptAssignment(
    html: string,
    pattern: RegExp,
  ): Record<string, unknown> | null {
    const match = html.match(pattern);
    if (!match?.[1]) return null;
    return JSON.parse(match[1]) as Record<string, unknown>;
  }

  private parseInitData(html: string): Record<string, unknown> | null {
    const match = html.match(
      /<script[^>]*id=["']__AER_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    ) ?? html.match(/data:\s*(\{[\s\S]*?"priceModule"[\s\S]*?\})\s*,\s*csrfToken/);

    if (!match?.[1]) return null;
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    return parsed;
  }

  private parseJsonLd(html: string): Record<string, unknown> | null {
    const scripts = [
      ...html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];

    for (const script of scripts) {
      try {
        const data = JSON.parse(script[1]!) as Record<string, unknown> | Array<Record<string, unknown>>;
        const items = Array.isArray(data) ? data : [data];
        const product = items.find(
          (item) =>
            item["@type"] === "Product" ||
            (Array.isArray(item["@type"]) &&
              (item["@type"] as string[]).includes("Product")),
        );
        if (product) return { jsonLd: product };
      } catch {
        // continue
      }
    }
    return null;
  }

  private normalize(
    aliexpressId: string,
    url: string,
    raw: Record<string, unknown>,
    html: string,
  ): AliExpressProduct {
    const data = (raw.data as Record<string, unknown> | undefined) ?? raw;
    const jsonLd = (raw.jsonLd as Record<string, unknown> | undefined) ?? null;

    const title =
      this.asString(this.dig(data, ["titleModule", "subject"])) ||
      this.asString(this.dig(data, ["productInfoComponent", "subject"])) ||
      this.asString(jsonLd?.name) ||
      this.metaContent(html, "og:title") ||
      `AliExpress Product ${aliexpressId}`;

    const images = this.collectImages(data, jsonLd, html);
    const priceInfo = this.collectPrices(data, jsonLd);
    const variants = this.collectVariants(data, priceInfo.currency, priceInfo.min);
    const attributes = this.collectAttributes(data);
    const descriptionHtml =
      this.asString(this.dig(data, ["descriptionModule", "descriptionUrl"])) ||
      this.asString(jsonLd?.description) ||
      `<p>${this.escapeHtml(title)}</p>`;

    return {
      aliexpressId,
      url,
      title: title.trim(),
      descriptionHtml,
      currency: priceInfo.currency,
      originalPrice: priceInfo.min,
      minPrice: priceInfo.min,
      maxPrice: priceInfo.max,
      images,
      variants,
      category: this.asString(this.dig(data, ["crossLinkModule", "productType"])) || undefined,
      attributes,
      scrapedAt: new Date().toISOString(),
    };
  }

  private collectImages(
    data: Record<string, unknown>,
    jsonLd: Record<string, unknown> | null,
    html: string,
  ): string[] {
    const fromModule =
      (this.dig(data, ["imageModule", "imagePathList"]) as string[] | undefined) ??
      (this.dig(data, ["imageModule", "imageList"]) as string[] | undefined) ??
      [];

    const fromLd = (() => {
      const img = jsonLd?.image;
      if (typeof img === "string") return [img];
      if (Array.isArray(img)) return img.filter((x): x is string => typeof x === "string");
      return [];
    })();

    const og = this.metaContent(html, "og:image");
    const combined = [...fromModule, ...fromLd, ...(og ? [og] : [])]
      .map((src) => this.normalizeImageUrl(src))
      .filter(Boolean);

    return [...new Set(combined)];
  }

  private collectPrices(
    data: Record<string, unknown>,
    jsonLd: Record<string, unknown> | null,
  ): { min: number; max: number; currency: string } {
    const formated =
      this.asString(this.dig(data, ["priceModule", "formatedActivityPrice"])) ||
      this.asString(this.dig(data, ["priceModule", "formatedPrice"]));

    const minAmount = Number(
      this.dig(data, ["priceModule", "minAmount", "value"]) ??
        this.dig(data, ["priceModule", "minPrice"]) ??
        this.dig(data, ["priceComponent", "discountPrice", "minPrice"]) ??
        NaN,
    );
    const maxAmount = Number(
      this.dig(data, ["priceModule", "maxAmount", "value"]) ??
        this.dig(data, ["priceModule", "maxPrice"]) ??
        minAmount,
    );

    const currency =
      this.asString(this.dig(data, ["priceModule", "minAmount", "currency"])) ||
      this.asString(this.dig(data, ["priceModule", "currencyCode"])) ||
      this.parseCurrencyFromOffers(jsonLd) ||
      this.parseCurrencyFromText(formated) ||
      "USD";

    let min = Number.isFinite(minAmount) ? minAmount : this.parsePrice(formated);
    let max = Number.isFinite(maxAmount) ? maxAmount : min;

    if ((!min || min <= 0) && jsonLd) {
      const offers = jsonLd.offers as Record<string, unknown> | undefined;
      const price = Number(offers?.price ?? offers?.lowPrice ?? NaN);
      if (Number.isFinite(price)) {
        min = price;
        max = Number(offers?.highPrice ?? price);
      }
    }

    return {
      min: min > 0 ? min : 0,
      max: max > 0 ? max : min > 0 ? min : 0,
      currency,
    };
  }

  private collectVariants(
    data: Record<string, unknown>,
    currency: string,
    fallbackPrice: number,
  ): AliExpressVariant[] {
    const skuModule = this.dig(data, ["skuModule"]) as Record<string, unknown> | undefined;
    const priceList =
      (skuModule?.skuPriceList as Array<Record<string, unknown>> | undefined) ?? [];
    const props =
      (skuModule?.productSKUPropertyList as Array<Record<string, unknown>> | undefined) ??
      [];

    const propMaps = new Map<string, Map<string, string>>();
    for (const prop of props) {
      const name = this.asString(prop.skuPropertyName) || "Option";
      const values = new Map<string, string>();
      const list =
        (prop.skuPropertyValues as Array<Record<string, unknown>> | undefined) ?? [];
      for (const value of list) {
        const id = String(value.propertyValueIdLong ?? value.propertyValueId ?? "");
        const label =
          this.asString(value.propertyValueDisplayName) ||
          this.asString(value.propertyValueName) ||
          id;
        if (id) values.set(id, label);
      }
      propMaps.set(String(prop.skuPropertyId ?? name), values);
    }

    if (priceList.length === 0) {
      return [
        {
          sku: "default",
          title: "Default",
          price: fallbackPrice,
          currency,
          available: true,
          options: {},
        },
      ];
    }

    return priceList.map((sku, index) => {
      const skuAttr = this.asString(sku.skuPropIds) || "";
      const ids = skuAttr.split(",").filter(Boolean);
      const options: Record<string, string> = {};
      let optionIndex = 0;
      for (const [, values] of propMaps) {
        const id = ids[optionIndex];
        if (id && values.has(id)) {
          options[`option${optionIndex + 1}`] = values.get(id)!;
        }
        optionIndex += 1;
      }

      const amount = Number(
        this.dig(sku, ["skuVal", "skuActivityAmount", "value"]) ??
          this.dig(sku, ["skuVal", "skuAmount", "value"]) ??
          fallbackPrice,
      );

      const availableQty = Number(
        this.dig(sku, ["skuVal", "availQuantity"]) ??
          this.dig(sku, ["skuVal", "inventory"]) ??
          1,
      );

      const title =
        Object.values(options).join(" / ") || `Variant ${index + 1}`;

      return {
        sku: this.asString(sku.skuIdStr) || this.asString(sku.skuId) || `sku-${index + 1}`,
        title,
        price: Number.isFinite(amount) && amount > 0 ? amount : fallbackPrice,
        currency,
        available: availableQty > 0,
        options,
      };
    });
  }

  private collectAttributes(data: Record<string, unknown>): Record<string, string> {
    const list =
      (this.dig(data, ["specsModule", "props"]) as Array<Record<string, unknown>> | undefined) ??
      (this.dig(data, ["productPropComponent", "props"]) as Array<Record<string, unknown>> | undefined) ??
      [];

    const attrs: Record<string, string> = {};
    for (const item of list) {
      const key = this.asString(item.attrName) || this.asString(item.name);
      const value = this.asString(item.attrValue) || this.asString(item.value);
      if (key && value) attrs[key] = value;
    }
    return attrs;
  }

  private dig(obj: unknown, path: string[]): unknown {
    let cur: unknown = obj;
    for (const key of path) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
  }

  private asString(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  private parsePrice(text: string | undefined): number {
    if (!text) return 0;
    const normalized = text.replace(/[^\d.,]/g, "").replace(",", "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  private parseCurrencyFromText(text: string | undefined): string | null {
    if (!text) return null;
    const match = text.match(/[A-Z]{3}/);
    return match?.[0] ?? null;
  }

  private parseCurrencyFromOffers(jsonLd: Record<string, unknown> | null): string | null {
    const offers = jsonLd?.offers as Record<string, unknown> | undefined;
    const code = offers?.priceCurrency;
    return typeof code === "string" ? code : null;
  }

  private normalizeImageUrl(src: string): string {
    if (!src) return "";
    if (src.startsWith("//")) return `https:${src}`;
    return src;
  }

  private metaContent(html: string, property: string): string | null {
    const re = new RegExp(
      `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i",
    );
    const alt = new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["'][^>]*>`,
      "i",
    );
    return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
}
