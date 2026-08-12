import type { ProductSearchFilters } from "../types";
import type { MarketplaceListing, MarketplaceSearchResult } from "../types/marketplace";
import { HttpError } from "../utils/http";
import {
  fetchMarketplaceHtml,
  isBlockedMarketplaceHtml,
  normalizeImageUrl,
} from "../utils/marketplace-fetch";

function sheinHost(locale?: string): string {
  return locale === "en" ? "https://www.shein.com" : "https://ar.shein.com";
}

function extractProductId(url: string, sku?: string): string {
  if (sku && /^\d+$/.test(sku)) return sku;
  const fromP = url.match(/-p-(\d+)(?:-cat|-\.html)/i);
  if (fromP?.[1]) return fromP[1];
  const loose = url.match(/(\d{6,})/);
  return loose?.[1] ?? url;
}

interface JsonLdProduct {
  name?: string;
  url?: string;
  image?: string;
  sku?: string;
  aggregateRating?: {
    ratingValue?: string | number;
    reviewCount?: string | number;
    ratingCount?: string | number;
  };
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    url?: string;
  };
}

/**
 * Shein search via JSON-LD ItemList on pdsearch SSR pages.
 */
export class SheinService {
  buildSearchUrl(query: string, page = 1, locale?: string): string {
    const host = sheinHost(locale);
    const encoded = encodeURIComponent(query.trim()).replace(/%20/g, "+");
    return `${host}/pdsearch/${encoded}/?page=${page}&sort=7&limit=20`;
  }

  buildProductUrl(productId: string, path?: string, locale?: string): string {
    const host = sheinHost(locale);
    if (path?.startsWith("http")) return path;
    if (path?.startsWith("/")) return `${host}${path}`;
    return `${host}/p-${productId}.html`;
  }

  parseSearchHtml(html: string, query = "", locale?: string): MarketplaceListing[] {
    const fromLd = this.parseJsonLd(html, query, locale);
    if (fromLd.length) return fromLd;
    return this.parseEmbeddedGoods(html, query, locale);
  }

  private parseJsonLd(
    html: string,
    query: string,
    locale?: string,
  ): MarketplaceListing[] {
    const scripts = [...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )];

    const listings: MarketplaceListing[] = [];

    for (const script of scripts) {
      try {
        const data = JSON.parse(script[1]!) as Record<string, unknown>;
        const graphs: unknown[] = [];

        if (Array.isArray(data["@graph"])) {
          graphs.push(...(data["@graph"] as unknown[]));
        } else {
          graphs.push(data);
        }

        for (const node of graphs) {
          const n = node as Record<string, unknown>;
          if (n["@type"] !== "ItemList" && !n.itemListElement) continue;

          const elements = (n.itemListElement as Array<Record<string, unknown>>) ?? [];
          for (const el of elements) {
            const item = (el.item ?? el) as JsonLdProduct;
            if (!item?.name) continue;

            const url = item.url || item.offers?.url || "";
            const productId = extractProductId(url, item.sku);
            const price = Number(item.offers?.price ?? 0);
            const currency = (item.offers?.priceCurrency || "SAR").toUpperCase();
            const rating = Number(item.aggregateRating?.ratingValue);
            const reviews = Number(
              item.aggregateRating?.reviewCount ??
                item.aggregateRating?.ratingCount,
            );

            listings.push({
              marketplace: "shein",
              externalId: productId,
              aliexpressId: productId,
              title: item.name,
              url: this.buildProductUrl(productId, url, locale),
              image: normalizeImageUrl(item.image),
              images: item.image ? [normalizeImageUrl(item.image)] : [],
              originalPrice: price,
              currency,
              rating: Number.isFinite(rating) ? rating : undefined,
              reviewCount: Number.isFinite(reviews) ? reviews : undefined,
              matchedKeyword: query,
            });
          }
        }
      } catch {
        // skip invalid JSON-LD
      }
    }

    return listings;
  }

  private parseEmbeddedGoods(
    html: string,
    query: string,
    locale?: string,
  ): MarketplaceListing[] {
    const byId = new Map<string, MarketplaceListing>();
    const blockRe =
      /goods_name":"((?:\\.|[^"\\])*)"[\s\S]{0,800}?salePrice":\{"amount":"([\d.]+)"[\s\S]{0,200}?usdAmount":"([\d.]+)"/g;

    let match: RegExpExecArray | null;
    while ((match = blockRe.exec(html)) !== null) {
      const title = match[1].replace(/\\u002F/g, "/");
      const sar = Number(match[2]);
      const usd = Number(match[3]);
      const ctx = html.slice(Math.max(0, match.index! - 400), match.index! + 200);
      const urlMatch = ctx.match(/goods_url_name":"([^"]+)"/);
      const imgMatch = ctx.match(/https?:\\?\/\\?\/[^"\\]+thumbnail[^"\\]+/);

      const path = urlMatch?.[1];
      const productId = path?.match(/-p-(\d+)/)?.[1] ?? String(byId.size + 1);

      if (byId.has(productId)) continue;

      byId.set(productId, {
        marketplace: "shein",
        externalId: productId,
        aliexpressId: productId,
        title,
        url: path
          ? this.buildProductUrl(productId, `/${path}-p-${productId}.html`, locale)
          : this.buildProductUrl(productId, undefined, locale),
        image: imgMatch ? normalizeImageUrl(imgMatch[0].replace(/\\/g, "")) : "",
        images: [],
        originalPrice: usd > 0 ? usd : sar,
        currency: usd > 0 ? "USD" : "SAR",
        matchedKeyword: query,
      });
    }

    return [...byId.values()];
  }

  async search(filters: ProductSearchFilters): Promise<MarketplaceSearchResult> {
    const query = (filters.query ?? "").trim();
    if (query.length < 2) {
      throw new HttpError(400, "اكتب كلمة بحث (حرفين أو أكثر)");
    }

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const searchUrl = this.buildSearchUrl(query, page, filters.locale);
    let status: MarketplaceSearchResult["status"] = "ok";
    let warning: string | undefined;
    let error: string | undefined;
    let results: MarketplaceListing[] = [];

    try {
      const html = await fetchMarketplaceHtml(searchUrl, {
        referer: sheinHost(filters.locale),
        locale: filters.locale,
      });

      results = this.parseSearchHtml(html, query, filters.locale);

      if (results.length > 0) {
        status = "ok";
      } else if (isBlockedMarketplaceHtml(html)) {
        status = "blocked";
        warning = "شي إن حظر الطلب (Cloudflare) — جرّب بعد دقيقة";
      } else {
        status = "empty";
        warning =
          "شي إن لم يُرجع منتجات — تأكد من الكلمة أو أعد المحاولة";
      }
    } catch (err) {
      status = "error";
      error = err instanceof Error ? err.message : "فشل البحث في شي إن";
      warning = error;
    }

    return {
      marketplace: "shein",
      labelAr: "شي إن",
      query,
      searchUrl,
      status,
      results,
      totalParsed: results.length,
      warning,
      error,
    };
  }
}
