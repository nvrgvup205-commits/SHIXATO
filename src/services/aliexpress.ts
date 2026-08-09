import type { AliExpressProduct, AliExpressVariant } from "../types";
import { extractAliExpressId, fetchWithTimeout, HttpError } from "../utils/http";

/**
 * AliExpress product extractor.
 * Strategy: fetch public product HTML → pull embedded JSON blobs
 * (runParams / _init_data_ / meta) → normalize into AliExpressProduct.
 *
 * Note: AliExpress markup changes often; parsers are defensive and layered.
 */
export class AliExpressService {
  buildProductUrl(aliexpressId: string): string {
    return `https://www.aliexpress.com/item/${aliexpressId}.html`;
  }

  async fetchProduct(input: string): Promise<AliExpressProduct> {
    const aliexpressId = extractAliExpressId(input);
    if (!aliexpressId) {
      throw new HttpError(400, "Invalid AliExpress URL or product id");
    }

    const url = this.buildProductUrl(aliexpressId);
    const html = await this.fetchHtml(url);
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

  private async fetchHtml(url: string): Promise<string> {
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
        },
      },
      25_000,
    );

    if (!res.ok) {
      throw new HttpError(502, `AliExpress HTTP ${res.status}`, {
        url,
        status: res.status,
      });
    }

    return res.text();
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
