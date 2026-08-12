import { resolveSearchQuery } from "../data/categories";
import { slugifyWholesaleQuery } from "../data/aliexpress-search-url";
import type {
  AliExpressListing,
  AliExpressProduct,
  AliExpressSearchResult,
  AliExpressVariant,
  ProductSearchFilters,
} from "../types";
import { SEARCH_SORT_MAP } from "../types/search";
import {
  canonicalAliExpressProductUrl,
  extractAliExpressId,
  fetchWithTimeout,
  HttpError,
  resolveAliExpressProductUrl,
} from "../utils/http";
import { resolveArabicDescriptionHtml } from "../utils/arabic-product";

/**
 * AliExpress product extractor + search.
 * Search uses wholesale SSR pages (more reliable than PDP).
 * PDP scrape is best-effort; callers can fall back to listing cards.
 */
export class AliExpressService {
  private static readonly SHIPPING_METHOD_LABELS: Record<string, string> = {
    sea: "AliExpress Standard Shipping",
    air: "AliExpress Saver Shipping",
    premium: "AliExpress Premium Shipping",
    express: "AliExpress Premium Shipping",
    cainiao: "Cainiao Super Economy",
    local: "Local delivery",
  };

  private static readonly SHIP_TO_CURRENCY: Record<string, string> = {
    SA: "SAR",
    AE: "AED",
    US: "USD",
    GB: "GBP",
    DE: "EUR",
    FR: "EUR",
    EG: "EGP",
  };

  buildProductUrl(aliexpressId: string): string {
    return canonicalAliExpressProductUrl(aliexpressId);
  }

  buildSearchUrl(filters: ProductSearchFilters, options?: { minimal?: boolean }): string {
    const locale = filters.locale === "en" ? "en" : "ar";
    const host =
      locale === "ar" ? "https://ar.aliexpress.com" : "https://www.aliexpress.com";
    const safe = slugifyWholesaleQuery(filters.query ?? "");
    const params = new URLSearchParams();
    const page = filters.page && filters.page > 1 ? filters.page : 1;
    if (page > 1) params.set("page", String(page));

    const sort = SEARCH_SORT_MAP[filters.sort ?? "orders"];
    if (sort) params.set("SortType", sort);

    const minimal = options?.minimal ?? filters.applyUrlFilters === false;
    if (!minimal) {
      if (filters.minPrice != null && filters.minPrice >= 0) {
        params.set("minPrice", String(filters.minPrice));
      }
      if (filters.maxPrice != null && filters.maxPrice > 0) {
        params.set("maxPrice", String(filters.maxPrice));
      }
      if (filters.shipFromCountry) {
        params.set("shipFromCountry", filters.shipFromCountry.toUpperCase());
      }
      if (filters.shipToCountry) {
        params.set("shipCountry", filters.shipToCountry.toUpperCase());
      }
      if (filters.freeShipping) params.set("isFreeShip", "y");
      if (filters.choiceOnly) params.set("g", "y");
      if (filters.highRatedSellers) params.set("isFavorite", "y");
      if (filters.unitPrice) params.set("isUnitPrice", "y");
    }

    if (locale === "ar") params.set("lang", "ar");

    const qs = params.toString();
    return `${host}/w/wholesale-${safe}.html${qs ? `?${qs}` : ""}`;
  }

  /** Exposed for unit tests / diagnostics */
  parseSearchHtml(html: string): AliExpressListing[] {
    return this.parseSearchResults(html);
  }

  async search(filters: ProductSearchFilters): Promise<AliExpressSearchResult> {
    const resolved = resolveSearchQuery({
      query: filters.query,
      category: filters.category,
    });

    if (resolved.query.length < 2) {
      throw new HttpError(
        400,
        "اختر فئة أو اكتب كلمة بحث — البحث الفارغ يحتاج فئة على الأقل",
      );
    }

    const normalized: ProductSearchFilters = {
      ...filters,
      query: resolved.query,
      category: resolved.categoryId ?? filters.category,
      page: filters.page && filters.page > 0 ? filters.page : 1,
      sort: filters.sort ?? "orders",
      currency: (filters.currency || "USD").toUpperCase(),
      shipToCountry: (filters.shipToCountry || "SA").toUpperCase(),
      locale: filters.locale === "en" ? "en" : "ar",
      filterMode:
        filters.filterMode ??
        (filters.presetGrade ? "soft" : "strict"),
      applyUrlFilters:
        filters.applyUrlFilters ??
        (filters.presetGrade ? false : true),
    };

    const locale = normalized.locale === "en" ? "en" : "ar";
    const cookie = this.buildLocaleCookie(
      normalized.currency!,
      normalized.shipToCountry!,
      locale,
    );

    const fetchPages = Math.min(
      Math.max(normalized.fetchPages ?? (normalized.presetGrade ? 2 : 1), 1),
      3,
    );

    const searchUrl = this.buildSearchUrl(normalized);
    let usedFallbackUrl = normalized.applyUrlFilters === false;
    const parsedById = new Map<string, AliExpressListing>();

    for (let page = 1; page <= fetchPages; page += 1) {
      const pageFilters = { ...normalized, page };
      let html: string | null = null;

      if (!normalized.applyUrlFilters) {
        const minimalUrl = this.buildSearchUrl(pageFilters, { minimal: true });
        html = await this.fetchSearchHtml(minimalUrl, cookie, locale);
      } else {
        try {
          const fullUrl = this.buildSearchUrl(pageFilters);
          html = await this.fetchSearchHtml(fullUrl, cookie, locale);
          if (this.isBlockedPage(html)) throw new Error("blocked");
        } catch {
          usedFallbackUrl = true;
          const minimalUrl = this.buildSearchUrl(pageFilters, { minimal: true });
          html = await this.fetchSearchHtml(minimalUrl, cookie, locale);
        }
      }

      if (!html || this.isBlockedPage(html)) {
        if (page === 1) {
          throw new HttpError(
            502,
            "علي إكسبريس حظر الصفحة مؤقتًا. جرّب بعد دقيقة أو استخدم البحث الذكي",
          );
        }
        break;
      }

      const pageItems = this.parseSearchResults(html);
      for (const item of pageItems) {
        if (!parsedById.has(item.aliexpressId)) {
          parsedById.set(item.aliexpressId, item);
        }
      }

      if (pageItems.length < 8) break;
    }

    const parsed = [...parsedById.values()];
    const results = this.applyClientFilters(parsed, normalized);

    let warning: string | undefined;
    if (parsed.length === 0) {
      warning = "علي إكسبريس لم يُرجع منتجات — جرّب كلمة أخرى أو أعد المحاولة";
    } else if (results.length === 0) {
      warning =
        `وجدنا ${parsed.length} منتجًا لكن الفلاتر استبعدتهم — جرّب «عرض بدون فلتر» أو البحث الذكي`;
    } else if (usedFallbackUrl) {
      warning =
        "تم جلب نتائج برابط مبسّط (أكثر استقرارًا) — الفلاتر طُبّقت محليًا بالترتيب الذكي";
    } else if (normalized.filterMode === "soft") {
      warning = `تم ترتيب ${results.length} منتجًا حسب جودة الدروب شيبنج (وضع ذكي)`;
    }

    return {
      query: resolved.query,
      page: normalized.page!,
      searchUrl,
      searchUrlUsed: usedFallbackUrl
        ? this.buildSearchUrl(normalized, { minimal: true })
        : searchUrl,
      filtersApplied: {
        ...normalized,
        categoryLabelAr: resolved.categoryLabelAr,
        freeTextQuery: (filters.query ?? "").trim() || null,
        fetchPages,
      },
      results,
      resultsBeforeFilter: parsed,
      totalParsed: parsed.length,
      totalAfterFilter: results.length,
      warning,
      usedFallbackUrl,
    };
  }

  private async fetchSearchHtml(
    url: string,
    cookie: string,
    locale: "ar" | "en",
  ): Promise<string> {
    const html = await this.fetchHtml(url, {
      allowShort: false,
      cookie,
      locale,
    });
    return html;
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
      descriptionHtml: resolveArabicDescriptionHtml(listing),
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
        ...(listing.soldCount != null
          ? { soldCount: String(listing.soldCount) }
          : {}),
        ...(listing.rating != null ? { rating: String(listing.rating) } : {}),
        ...(listing.reviewCount != null
          ? { reviewCount: String(listing.reviewCount) }
          : {}),
        ...(listing.badges?.length
          ? { badges: listing.badges.join(",") }
          : {}),
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

  private buildLocaleCookie(
    currency: string,
    shipToCountry: string,
    locale: "ar" | "en" = "ar",
  ): string {
    const bLocale = locale === "ar" ? "ar_SA" : "en_US";
    const lang = locale === "ar" ? "ar" : "en";
    return [
      `aep_usuc_f=site=glo&c_tp=${encodeURIComponent(currency)}&region=${encodeURIComponent(shipToCountry)}&b_locale=${bLocale}`,
      `intl_locale=${bLocale}`,
      `xman_us_f=x_locale=${bLocale}&x_l=1&x_c_chg=1`,
      `aep_history=${lang}`,
    ].join("; ");
  }

  private async fetchHtml(
    url: string,
    options?: { allowShort?: boolean; cookie?: string; locale?: "ar" | "en" },
  ): Promise<string> {
    const locale = options?.locale === "en" ? "en" : "ar";
    const referer =
      locale === "ar"
        ? "https://ar.aliexpress.com/"
        : "https://www.aliexpress.com/";
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":
        locale === "ar"
          ? "ar-SA,ar;q=0.95,en;q=0.5"
          : "en-US,en;q=0.9,ar;q=0.8",
      Referer: referer,
      "Cache-Control": "no-cache",
      "Upgrade-Insecure-Requests": "1",
    };
    if (options?.cookie) headers.Cookie = options.cookie;

    const res = await fetchWithTimeout(
      url,
      {
        headers,
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
    const titleHints = this.extractTitleHintsFromHtml(html);

    const fromItemList = this.extractItemListContent(html);
    if (fromItemList?.length) {
      return fromItemList
        .map((item) => this.listingFromSearchItem(item, titleHints))
        .filter((x): x is AliExpressListing => Boolean(x));
    }

    const blob = this.extractBalancedJson(html, '{"appData":');
    if (blob) {
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
        const content =
          (itemList?.content as Array<Record<string, unknown>>) ?? [];
        if (content.length) {
          return content
            .map((item) => this.listingFromSearchItem(item, titleHints))
            .filter((x): x is AliExpressListing => Boolean(x));
        }
      } catch {
        // fall through
      }
    }

    return this.parseSearchResultsFallback(html, titleHints);
  }

  /** Pull displayTitle / Arabic titles keyed by productId from raw HTML */
  private extractTitleHintsFromHtml(html: string): Map<string, string> {
    const out = new Map<string, string>();
    const patterns = [
      /"productId"\s*:\s*"(\d{6,20})"[\s\S]{0,1200}?"displayTitle"\s*:\s*"((?:\\.|[^"\\])+)"/g,
      /"productId"\s*:\s*"(\d{6,20})"[\s\S]{0,1200}?"seoTitle"\s*:\s*"((?:\\.|[^"\\])+)"/g,
    ];

    for (const re of patterns) {
      for (const match of html.matchAll(re)) {
        const id = match[1]!;
        let title = match[2]!;
        try {
          title = JSON.parse(`"${title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
        } catch {
          title = title.replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        }
        if (title && (!out.has(id) || this.hasArabic(title))) {
          out.set(id, title);
        }
      }
    }
    return out;
  }

  private hasArabic(text: string): boolean {
    return /[\u0600-\u06FF]/.test(text);
  }

  /** Pull `itemList.content` array from modern AliExpress search HTML/JS. */
  private extractItemListContent(
    html: string,
  ): Array<Record<string, unknown>> | null {
    const needles = [
      '"itemList":{"content":[',
      '"itemList":{ "content":[',
      '"itemList":{"content" : [',
    ];
    let idx = -1;
    let needle = needles[0]!;
    for (const n of needles) {
      idx = html.indexOf(n);
      if (idx >= 0) {
        needle = n;
        break;
      }
    }
    if (idx < 0) return null;

    const arrStart = idx + needle.indexOf("[");
    const arrJson = this.extractBalancedArray(html, arrStart);
    if (!arrJson) return null;

    try {
      const content = JSON.parse(arrJson) as Array<Record<string, unknown>>;
      return Array.isArray(content) ? content : null;
    } catch {
      return null;
    }
  }

  private extractBalancedArray(source: string, start: number): string | null {
    if (source[start] !== "[") return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < source.length; i++) {
      const ch = source[i]!;
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
      if (ch === "[") depth += 1;
      else if (ch === "]") {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    return null;
  }

  private listingFromSearchItem(
    item: Record<string, unknown>,
    titleHints?: Map<string, string>,
  ): AliExpressListing | null {
    const aliexpressId = String(item.productId ?? item.redirectedId ?? "");
    if (!/^\d{6,20}$/.test(aliexpressId)) return null;

    const titleObj = item.title as Record<string, unknown> | undefined;
    const multiLang = item.multiLanguageTitleDTOList as
      | Array<Record<string, unknown>>
      | undefined;
    const arFromMulti = multiLang?.find((t) =>
      /ar/i.test(String(t.language ?? t.locale ?? "")),
    );
    const hint = titleHints?.get(aliexpressId);

    let title =
      this.asString(arFromMulti?.title) ||
      this.asString(arFromMulti?.displayTitle) ||
      (hint && this.hasArabic(hint) ? hint : "") ||
      this.asString(titleObj?.displayTitle) ||
      this.asString(titleObj?.seoTitle) ||
      hint ||
      this.asString(titleObj?.title) ||
      this.asString(item.subject) ||
      `Product ${aliexpressId}`;

    const imageObj = item.image as Record<string, unknown> | undefined;
    const primaryImage = this.normalizeImageUrl(this.asString(imageObj?.imgUrl));
    const cardImages = this.collectSearchCardImages(item, primaryImage);
    const image = cardImages[0] || "";

    const prices = item.prices as Record<string, unknown> | undefined;
    const salePrice = prices?.salePrice as Record<string, unknown> | undefined;
    const originalPriceObj = prices?.originalPrice as
      | Record<string, unknown>
      | undefined;
    const extra = item.extraParams as Record<string, unknown> | undefined;

    let sale = Number(salePrice?.minPrice ?? NaN);
    if (!Number.isFinite(sale) || sale <= 0) {
      const cents = Number(extra?.salePriceAmount ?? NaN);
      if (Number.isFinite(cents) && cents > 0) sale = cents / 100;
    }
    if (!Number.isFinite(sale) || sale < 0) sale = 0;

    let listPrice = Number(originalPriceObj?.minPrice ?? NaN);
    if (!Number.isFinite(listPrice) || listPrice <= 0) {
      const cents = Number(extra?.originPriceAmount ?? NaN);
      if (Number.isFinite(cents) && cents > 0) listPrice = cents / 100;
    }

    const currency =
      this.asString(salePrice?.currencyCode) ||
      this.asString(originalPriceObj?.currencyCode) ||
      "USD";

    const trade = item.trade as Record<string, unknown> | undefined;
    const evaluation = item.evaluation as Record<string, unknown> | undefined;
    const soldText = this.asString(trade?.tradeDesc) || undefined;
    const soldCount = this.parseSoldCount(
      trade?.realTradeCount ?? trade?.tradeDesc,
    );

    const rating =
      typeof evaluation?.starRating === "number"
        ? evaluation.starRating
        : Number(evaluation?.starRating ?? NaN);
    const reviewCount = this.parseReviewCount(evaluation);

    const discountPercent =
      Number.isFinite(listPrice) &&
      listPrice > 0 &&
      sale > 0 &&
      listPrice > sale
        ? Math.round(((listPrice - sale) / listPrice) * 100)
        : typeof salePrice?.discount === "number"
          ? salePrice.discount
          : undefined;

    const badges = this.extractBadges(item);
    const isChoice = badges.some((b) => /choice/i.test(b));

    const sellingPoints =
      (item.sellingPoints as Array<Record<string, unknown>> | undefined) ?? [];
    const shippingSp = this.parseShippingFromSellingPoints(sellingPoints);
    const tracePdp = this.parseTracePdp(item);

    const isFreeShipping =
      shippingSp.shippingType === "free" ||
      shippingSp.shippingType === "conditional_free" ||
      badges.some((b) => /free\s*shipping/i.test(b));

    let shippingType = shippingSp.shippingType;
    if (
      shippingType === "unknown" &&
      tracePdp.shippingCost != null &&
      tracePdp.shippingCost > 0
    ) {
      shippingType = "paid";
    }

    const isViral =
      badges.some((b) => /viral|trending|hot|bestseller|top/i.test(b)) ||
      (soldCount != null && soldCount >= 1000);

    // Card pages rarely expose explicit negative counts — estimate from stars.
    const negativeRateEstimate =
      Number.isFinite(rating) && rating > 0
        ? Math.max(0, Math.min(100, Math.round((1 - rating / 5) * 100)))
        : undefined;

    const detailUrl = this.asString(item.productDetailUrl);
    const url =
      resolveAliExpressProductUrl(detailUrl, aliexpressId) ??
      this.buildProductUrl(aliexpressId);

    const shipFrom =
      tracePdp.shipFrom ||
      this.asString(extra?.shipFrom) ||
      this.asString(extra?.ship_from) ||
      undefined;

    return {
      aliexpressId,
      title,
      url,
      image,
      images: cardImages,
      originalPrice: sale,
      listPrice: Number.isFinite(listPrice) && listPrice > 0 ? listPrice : undefined,
      currency,
      sold: soldText,
      soldCount,
      rating: Number.isFinite(rating) ? rating : undefined,
      reviewCount,
      negativeRateEstimate,
      discountPercent,
      badges,
      isChoice,
      isFreeShipping,
      isViral,
      shipFrom,
      shipTo: tracePdp.shipTo,
      shippingMethod: tracePdp.methodLabel,
      shippingMethodCode: tracePdp.methodCode,
      shippingCarrier: tracePdp.carrier,
      deliveryEstimate: shippingSp.deliveryEstimate,
      shippingType,
      shippingNote: shippingSp.shippingNote,
      shippingCost: tracePdp.shippingCost,
      shippingCostCurrency: tracePdp.shippingCostCurrency,
      isLocalWarehouse: shippingSp.isLocalWarehouse,
      storeLaunchDate: this.asString(item.lunchTime) || undefined,
    };
  }

  private collectSearchCardImages(
    item: Record<string, unknown>,
    primary?: string,
  ): string[] {
    const out: string[] = [];
    if (primary) out.push(primary);

    const imagesArr = item.images as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(imagesArr)) {
      for (const img of imagesArr) {
        const url = this.normalizeImageUrl(this.asString(img.imgUrl));
        if (url) out.push(url);
      }
    }

    const imageObj = item.image as Record<string, unknown> | undefined;
    const main = this.normalizeImageUrl(this.asString(imageObj?.imgUrl));
    if (main) out.push(main);

    return [...new Set(out.filter(Boolean))];
  }

  private parseShippingFromSellingPoints(
    points: Array<Record<string, unknown>>,
  ): {
    shippingType: "free" | "conditional_free" | "paid" | "unknown";
    shippingNote?: string;
    deliveryEstimate?: string;
    isLocalWarehouse?: boolean;
  } {
    let shippingType: "free" | "conditional_free" | "paid" | "unknown" =
      "unknown";
    let shippingNote: string | undefined;
    let deliveryEstimate: string | undefined;
    let isLocalWarehouse = false;

    for (const sp of points) {
      const source = this.asString(sp.source);
      const text = this.asString(
        (sp.tagContent as Record<string, unknown> | undefined)?.tagText,
      );

      if (source === "ETA_atm" && text) {
        deliveryEstimate = text;
      }
      if (source === "Free_Shipping_atm") {
        shippingType = "free";
        shippingNote = text || "Free shipping";
      }
      if (source === "platformFreeShipping_atm") {
        if (shippingType !== "free") shippingType = "conditional_free";
        shippingNote = text || shippingNote;
      }
      if (source === "localplus_flag") {
        isLocalWarehouse = true;
      }
    }

    return {
      shippingType,
      shippingNote,
      deliveryEstimate,
      isLocalWarehouse,
    };
  }

  private parseTracePdp(item: Record<string, unknown>): {
    shipFrom?: string;
    shipTo?: string;
    methodCode?: string;
    methodLabel?: string;
    carrier?: string;
    shippingCost?: number;
    shippingCostCurrency?: string;
  } {
    const trace = item.trace as Record<string, unknown> | undefined;
    const pdp = trace?.pdpParams as Record<string, unknown> | undefined;
    if (!pdp) return {};

    let shipFrom: string | undefined;
    const cdi = this.asString(pdp.pdp_cdi);
    if (cdi) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cdi)) as Record<
          string,
          unknown
        >;
        const from = this.asString(parsed.shipFrom);
        if (from) shipFrom = from.toUpperCase();
      } catch {
        // ignore malformed trace blob
      }
    }

    const npiRaw = this.asString(pdp.pdp_npi);
    if (!npiRaw) return { shipFrom };

    const npi = decodeURIComponent(npiRaw);
    const logisticsMatch = npi.match(
      /!@([^!]+)!([^!]+)!([^!]+)!([^!]+)!(\d)!([^!]+)!/i,
    );
    if (!logisticsMatch) return { shipFrom };

    const preParts = npi.slice(0, logisticsMatch.index).split("!");
    const methodCode = this.asString(logisticsMatch[3]).toLowerCase();
    const shipToRaw = this.asString(logisticsMatch[4]);
    const shipTo =
      shipToRaw.length === 2 ? shipToRaw.toUpperCase() : shipToRaw || undefined;
    const carrier = this.asString(logisticsMatch[6]) || undefined;

    const priceCurrency = this.asString(preParts[1]).toUpperCase();
    const shippingCost = this.extractNpiShippingCost(preParts);

    let shippingCostValue: number | undefined;
    let shippingCostCurrency: string | undefined;
    if (shippingCost != null && shippingCost > 0) {
      shippingCostValue = shippingCost;
      shippingCostCurrency =
        (shipTo && AliExpressService.SHIP_TO_CURRENCY[shipTo]) ||
        priceCurrency ||
        undefined;
    }

    const methodLabel =
      (methodCode && AliExpressService.SHIPPING_METHOD_LABELS[methodCode]) ||
      methodCode ||
      undefined;

    return {
      shipFrom,
      shipTo,
      methodCode: methodCode || undefined,
      methodLabel,
      carrier,
      shippingCost: shippingCostValue,
      shippingCostCurrency,
    };
  }

  /** Last positive amount in the npi price segment ≈ shipping in destination currency */
  private extractNpiShippingCost(preParts: string[]): number | undefined {
    const nums = preParts
      .slice(2)
      .map((part) => Number(part))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length < 2) return undefined;
    return nums[nums.length - 1];
  }

  private extractBadges(item: Record<string, unknown>): string[] {
    const out: string[] = [];
    const points =
      (item.sellingPoints as Array<Record<string, unknown>> | undefined) ?? [];
    for (const sp of points) {
      const tc = (sp.tagContent as Record<string, unknown> | undefined) ?? {};
      const text =
        this.asString(tc.tagText) ||
        this.asString(tc.displayTagType) ||
        this.asString(sp.sellingPointTagId);
      if (text) out.push(text);
    }
    const rainbow = item.rainbow as Record<string, unknown> | undefined;
    if (rainbow?.title) out.push(this.asString(rainbow.title));
    return [...new Set(out)].slice(0, 12);
  }

  private parseSoldCount(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const cleaned = value.replace(/,/g, "").trim();
    const m = cleaned.match(/([\d.]+)\s*([kKmM])?/);
    if (!m) return undefined;
    let n = Number(m[1]);
    if (!Number.isFinite(n)) return undefined;
    const suffix = (m[2] || "").toLowerCase();
    if (suffix === "k") n *= 1_000;
    if (suffix === "m") n *= 1_000_000;
    return Math.round(n);
  }

  private parseReviewCount(
    evaluation: Record<string, unknown> | undefined,
  ): number | undefined {
    if (!evaluation) return undefined;
    for (const key of [
      "localeEvalCnt",
      "evalCnt",
      "evalCount",
      "totalValidNum",
      "reviewCount",
    ]) {
      const n = Number(evaluation[key]);
      if (Number.isFinite(n) && n >= 0) return n;
      if (typeof evaluation[key] === "string") {
        const parsed = this.parseSoldCount(evaluation[key]);
        if (parsed != null) return parsed;
      }
    }
    return undefined;
  }

  private applyClientFilters(
    items: AliExpressListing[],
    filters: ProductSearchFilters,
  ): AliExpressListing[] {
    const mode =
      filters.filterMode ?? (filters.presetGrade ? "soft" : "strict");

    if (mode === "off") return items;

    const exclude = this.splitKeywords(filters.excludeKeywords);

    if (mode === "soft") {
      const scored = items
        .filter((item) => {
          const title = item.title.toLowerCase();
          return !exclude.some((k) => title.includes(k));
        })
        .map((item) => ({
          item,
          score: this.scoreListing(item, filters),
        }))
        .sort((a, b) => b.score - a.score);

      const minScore =
        filters.presetGrade === "pro"
          ? 58
          : filters.presetGrade === "balanced"
            ? 48
            : filters.presetGrade === "starter"
              ? 38
              : 45;

      let results = scored
        .filter((s) => s.score >= minScore)
        .map((s) => s.item);

      if (results.length < 12) {
        results = scored.slice(0, Math.min(48, scored.length)).map((s) => s.item);
      }

      return results;
    }

    const include = this.splitKeywords(filters.includeKeywords);

    return items.filter((item) => {
      if (filters.minSold != null && (item.soldCount ?? 0) < filters.minSold) {
        return false;
      }
      if (filters.maxSold != null && (item.soldCount ?? 0) > filters.maxSold) {
        return false;
      }
      if (filters.minRating != null && (item.rating ?? 0) < filters.minRating) {
        return false;
      }
      if (
        filters.minReviews != null &&
        (item.reviewCount ?? 0) < filters.minReviews
      ) {
        return false;
      }
      if (
        filters.maxNegativeRate != null &&
        (item.negativeRateEstimate ?? 100) > filters.maxNegativeRate
      ) {
        return false;
      }
      if (
        filters.minDiscountPercent != null &&
        (item.discountPercent ?? 0) < filters.minDiscountPercent
      ) {
        return false;
      }
      if (filters.requireViralBadge && !item.isViral) return false;
      if (filters.requireFreeShippingBadge && !item.isFreeShipping) {
        return false;
      }
      if (filters.choiceOnly && !item.isChoice) return false;

      const title = item.title.toLowerCase();
      if (exclude.some((k) => title.includes(k))) return false;
      if (include.length && !include.some((k) => title.includes(k))) {
        return false;
      }

      if (
        filters.targetSellingPrice != null &&
        filters.minMarginPercent != null &&
        item.originalPrice > 0
      ) {
        const margin =
          ((filters.targetSellingPrice - item.originalPrice) /
            filters.targetSellingPrice) *
          100;
        if (margin < filters.minMarginPercent) return false;
      }

      return true;
    });
  }

  private scoreListing(
    item: AliExpressListing,
    filters: ProductSearchFilters,
  ): number {
    let score = 40;

    if (filters.minSold != null) {
      const sold = item.soldCount ?? 0;
      if (sold >= filters.minSold) score += 28;
      else if (sold >= filters.minSold * 0.5) score += 12;
      else score -= 8;
    } else if ((item.soldCount ?? 0) > 0) {
      score += 10;
    }

    if (filters.minRating != null) {
      const rating = item.rating ?? 0;
      if (rating >= filters.minRating) score += 18;
      else if (rating >= filters.minRating - 0.3) score += 6;
      else score -= 10;
    } else if ((item.rating ?? 0) >= 4.3) {
      score += 8;
    }

    if (filters.minReviews != null) {
      const reviews = item.reviewCount ?? 0;
      if (reviews >= filters.minReviews) score += 12;
      else if (reviews >= filters.minReviews * 0.4) score += 4;
    }

    if (filters.maxNegativeRate != null) {
      const neg = item.negativeRateEstimate ?? 50;
      if (neg <= filters.maxNegativeRate) score += 8;
      else score -= 6;
    }

    if (filters.minDiscountPercent != null && (item.discountPercent ?? 0) >= filters.minDiscountPercent) {
      score += 6;
    }

    if (item.isChoice) score += 5;
    if (item.isFreeShipping) score += 5;
    if (item.isViral) score += 4;
    if (this.hasArabic(item.title)) score += 3;

    if (
      filters.targetSellingPrice != null &&
      filters.minMarginPercent != null &&
      item.originalPrice > 0
    ) {
      const margin =
        ((filters.targetSellingPrice - item.originalPrice) /
          filters.targetSellingPrice) *
        100;
      if (margin >= filters.minMarginPercent) score += 14;
      else if (margin >= filters.minMarginPercent - 10) score += 4;
      else score -= 6;
    }

    if (item.originalPrice > 0 && item.originalPrice <= 35) score += 4;

    return Math.max(0, Math.min(100, score));
  }

  private splitKeywords(value?: string): string[] {
    if (!value?.trim()) return [];
    return value
      .split(/[,|\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  private parseSearchResultsFallback(
    html: string,
    titleHints?: Map<string, string>,
  ): AliExpressListing[] {
    const ids = [
      ...new Set([...html.matchAll(/\/item\/(\d{6,20})\.html/g)].map((m) => m[1]!)),
    ];
    return ids.slice(0, 48).map((aliexpressId) => ({
      aliexpressId,
      title: titleHints?.get(aliexpressId) || `AliExpress ${aliexpressId}`,
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
