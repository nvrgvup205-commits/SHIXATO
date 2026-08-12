import type { ProductSearchFilters } from "../types";
import type { MarketplaceListing, MarketplaceSearchResult } from "../types/marketplace";
import { HttpError } from "../utils/http";
import {
  fetchMarketplaceHtml,
  isBlockedMarketplaceHtml,
  normalizeImageUrl,
} from "../utils/marketplace-fetch";

const REGION_PATH = "sa-en";

function slugifyQuery(query: string): string {
  return query.trim().replace(/\s+/g, "+");
}

function parseTemuPriceCents(priceInfo?: {
  price?: number;
  currency?: string;
  priceStr?: string;
}): { amount: number; currency: string } {
  const currency = (priceInfo?.currency || "USD").toUpperCase();
  if (priceInfo?.price != null && Number.isFinite(priceInfo.price)) {
    // Temu encodes cents in price field (995 = $9.95)
    const cents = Number(priceInfo.price);
    return { amount: cents >= 100 ? cents / 100 : cents, currency };
  }
  const str = priceInfo?.priceStr || "";
  const m = str.match(/([\d.]+)/);
  return { amount: m ? Number(m[1]) : 0, currency };
}

function parseSoldTip(salesTip?: string): number | undefined {
  if (!salesTip) return undefined;
  const m = salesTip.match(/([\d.]+)\s*([KkMm])?\+?\s*sold/i);
  if (!m) return undefined;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = (m[2] || "").toUpperCase();
  if (unit === "K") n *= 1000;
  if (unit === "M") n *= 1_000_000;
  return Math.round(n);
}

/**
 * Temu search via SSR goodsList on /w/search.html (sa-en region).
 */
export class TemuService {
  buildSearchUrl(query: string): string {
    const key = slugifyQuery(query);
    return `https://www.temu.com/${REGION_PATH}/w/search.html?search_key=${encodeURIComponent(key.replace(/\+/g, " "))}`;
  }

  buildProductUrl(goodsId: string, goodsName?: string): string {
    const id = goodsId.replace(/\D/g, "");
    if (goodsName) {
      const slug = goodsName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
      if (slug) {
        return `https://www.temu.com/${REGION_PATH}/${slug}-g-${id}.html`;
      }
    }
    return `https://www.temu.com/goods-detail.html?goods_id=${id}`;
  }

  parseSearchHtml(html: string, query = ""): MarketplaceListing[] {
    const byId = new Map<string, MarketplaceListing>();

    const blockRe =
      /\{"colType":"GOODS","goodsId":"(\d{8,})"[\s\S]{0,2500}?"priceInfo":\{[^}]+}/g;
    let match: RegExpExecArray | null;

    while ((match = blockRe.exec(html)) !== null) {
      const block = match[0];
      const goodsId = match[1]!;
      const nameMatch = block.match(/"goodsName":"((?:\\.|[^"\\])*)"/);
      const thumbMatch =
        block.match(/"hdThumbUrl":"((?:\\.|[^"\\])*)"/) ||
        block.match(/"thumbUrl":"((?:\\.|[^"\\])*)"/);
      const priceMatch = block.match(
        /"priceInfo":\{"price":(\d+),"currency":"([^"]+)"/,
      );
      const salesMatch = block.match(/"salesTip":"((?:\\.|[^"\\])*)"/);

      const title = nameMatch
        ? nameMatch[1].replace(/\\u002F/g, "/").replace(/\\"/g, '"')
        : `Temu ${goodsId}`;

      const { amount, currency } = priceMatch
        ? parseTemuPriceCents({
            price: Number(priceMatch[1]),
            currency: priceMatch[2],
          })
        : { amount: 0, currency: "USD" };

      const image = thumbMatch
        ? normalizeImageUrl(
            thumbMatch[1].replace(/\\u002F/g, "/").replace(/\\"/g, '"'),
          )
        : "";

      const soldCount = salesMatch
        ? parseSoldTip(
            salesMatch[1].replace(/\\u002F/g, "/").replace(/\\"/g, '"'),
          )
        : undefined;

      const listing: MarketplaceListing = {
        marketplace: "temu",
        externalId: goodsId,
        aliexpressId: goodsId,
        title,
        url: this.buildProductUrl(goodsId, title),
        image,
        images: image ? [image] : [],
        originalPrice: amount,
        currency,
        soldCount,
        sold: salesMatch?.[1],
        matchedKeyword: query,
      };

      if (!byId.has(goodsId)) byId.set(goodsId, listing);
    }

    // Fallback: looser goodsId + goodsName pairs
    if (byId.size === 0) {
      const looseRe =
        /"goodsId":"(\d{8,})"[\s\S]{0,2000}?"goodsName":"((?:\\.|[^"\\])*)"[\s\S]{0,1200}?"priceInfo":\{"price":(\d+)/g;
      while ((match = looseRe.exec(html)) !== null) {
        const goodsId = match[1]!;
        const title = match[2].replace(/\\u002F/g, "/");
        const amount = Number(match[3]) / 100;
        if (byId.has(goodsId)) continue;
        byId.set(goodsId, {
          marketplace: "temu",
          externalId: goodsId,
          aliexpressId: goodsId,
          title,
          url: this.buildProductUrl(goodsId, title),
          image: "",
          images: [],
          originalPrice: amount,
          currency: "USD",
          matchedKeyword: query,
        });
      }
    }

    return [...byId.values()];
  }

  async search(filters: ProductSearchFilters): Promise<MarketplaceSearchResult> {
    const query = (filters.query ?? "").trim();
    if (query.length < 2) {
      throw new HttpError(400, "اكتب كلمة بحث (حرفين أو أكثر)");
    }

    const searchUrl = this.buildSearchUrl(query);
    let status: MarketplaceSearchResult["status"] = "ok";
    let warning: string | undefined;
    let error: string | undefined;
    let results: MarketplaceListing[] = [];

    try {
      const html = await fetchMarketplaceHtml(searchUrl, {
        referer: "https://www.temu.com/",
        locale: filters.locale,
      });

      results = this.parseSearchHtml(html, query);

      if (results.length > 0) {
        status = "ok";
      } else if (isBlockedMarketplaceHtml(html)) {
        status = "blocked";
        warning = "تيمو حظر الطلب — جرّب بعد دقيقة";
      } else {
        status = "empty";
        warning =
          "تيمو لم يُرجع منتجات في HTML — قد يحتاج تحديث الرابط أو إعادة المحاولة";
      }
    } catch (err) {
      status = "error";
      error = err instanceof Error ? err.message : "فشل البحث في تيمو";
      warning = error;
    }

    return {
      marketplace: "temu",
      labelAr: "تيمو",
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
