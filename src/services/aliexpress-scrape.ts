/**
 * Lightweight AliExpress search scraper — bypasses filter logic, multi-URL, Worker-safe.
 */
import {
  buildLegacyWholesaleUrl,
  slugifyWholesaleQuery,
} from "../data/aliexpress-search-url";
import type { AliExpressListing } from "../types";
import { SEARCH_SORT_MAP } from "../types/search";
import { fetchWithTimeout } from "../utils/http";
import { AliExpressService } from "./aliexpress";

export interface ScrapeSearchOptions {
  keyword: string;
  pages?: number;
  sort?: "orders" | "default" | "newest";
  locale?: "ar" | "en";
  currency?: string;
  shipToCountry?: string;
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
};

function buildLocaleCookie(
  currency: string,
  shipTo: string,
  locale: "ar" | "en",
): string {
  const bLocale = locale === "ar" ? "ar_SA" : "en_US";
  return [
    `aep_usuc_f=site=glo&c_tp=${encodeURIComponent(currency)}&region=${encodeURIComponent(shipTo)}&b_locale=${bLocale}`,
    `intl_locale=${bLocale}`,
    `xman_us_f=x_locale=${bLocale}&x_l=1&x_c_chg=1`,
  ].join("; ");
}

function buildSlugUrl(
  keyword: string,
  page: number,
  sort: string | undefined,
  locale: "ar" | "en",
): string {
  const host =
    locale === "ar" ? "https://ar.aliexpress.com" : "https://www.aliexpress.com";
  const slug = slugifyWholesaleQuery(keyword);
  const params = new URLSearchParams();
  if (sort) params.set("SortType", sort);
  if (page > 1) params.set("page", String(page));
  if (locale === "ar") params.set("lang", "ar");
  const qs = params.toString();
  return `${host}/w/wholesale-${slug}.html${qs ? `?${qs}` : ""}`;
}

function buildSearchUrls(
  keyword: string,
  page: number,
  sort: string | undefined,
): string[] {
  const urls: string[] = [];
  // English www first — most reliable from Cloudflare Workers
  urls.push(buildSlugUrl(keyword, page, sort, "en"));
  urls.push(
    buildLegacyWholesaleUrl({
      query: keyword,
      page,
      sort,
      locale: "en",
    }),
  );
  urls.push(buildSlugUrl(keyword, page, sort, "ar"));
  urls.push(
    buildLegacyWholesaleUrl({
      query: keyword,
      page,
      sort,
      locale: "ar",
    }),
  );
  return urls;
}

function isBlockedHtml(html: string): boolean {
  return (
    !html ||
    html.length < 2000 ||
    html.includes("_____tmd_____/punish") ||
    html.includes("x5secdata") ||
    (html.length < 8000 && html.includes("sessionStorage.x5referer"))
  );
}

async function fetchSearchHtml(
  url: string,
  cookie: string,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          ...BROWSER_HEADERS,
          Cookie: cookie,
          Referer: "https://www.aliexpress.com/",
        },
        redirect: "follow",
      },
      22_000,
    );
    if (!res.ok) return null;
    const html = await res.text();
    if (isBlockedHtml(html)) return null;
    return html;
  } catch {
    return null;
  }
}

function parseListings(html: string): AliExpressListing[] {
  const service = new AliExpressService();
  return service.parseSearchHtml(html);
}

function mergeById(
  primary: AliExpressListing[],
  extra: AliExpressListing[],
): AliExpressListing[] {
  const byId = new Map<string, AliExpressListing>();
  for (const item of primary) byId.set(item.aliexpressId, item);
  for (const item of extra) {
    if (!byId.has(item.aliexpressId)) byId.set(item.aliexpressId, item);
  }
  return [...byId.values()];
}

/**
 * Scrape one search page — tries slug URL then legacy SearchText URL, EN then AR.
 */
export async function scrapeSearchPage(
  keyword: string,
  page: number,
  options?: Partial<ScrapeSearchOptions>,
): Promise<AliExpressListing[]> {
  const sort = SEARCH_SORT_MAP[options?.sort ?? "orders"];
  const currency = (options?.currency || "USD").toUpperCase();
  const shipTo = (options?.shipToCountry || "SA").toUpperCase();
  const urls = buildSearchUrls(keyword, page, sort);

  for (const url of urls) {
    const locale = url.includes("ar.aliexpress") ? "ar" : "en";
    const cookie = buildLocaleCookie(currency, shipTo, locale);
    const html = await fetchSearchHtml(url, cookie);
    if (!html) continue;
    const items = parseListings(html);
    if (items.length > 0) return items;
  }
  return [];
}

/**
 * Scrape multiple pages for one keyword — stops early when page returns few items.
 */
export async function scrapeSearchKeyword(
  keyword: string,
  options?: Partial<ScrapeSearchOptions>,
): Promise<AliExpressListing[]> {
  const pages = Math.min(Math.max(options?.pages ?? 2, 1), 6);
  let pool: AliExpressListing[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const items = await scrapeSearchPage(keyword, page, options);
    if (!items.length) break;
    pool = mergeById(pool, items);
    if (items.length < 12) break;
  }

  return pool;
}
