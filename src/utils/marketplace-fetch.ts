import { fetchWithTimeout, HttpError } from "./http";

export const MARKETPLACE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function fetchMarketplaceHtml(
  url: string,
  options?: { referer?: string; cookie?: string; locale?: string },
): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": MARKETPLACE_USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": options?.locale === "ar"
      ? "ar,en-US;q=0.9,en;q=0.8"
      : "en-US,en;q=0.9,ar;q=0.8",
    "Cache-Control": "no-cache",
  };

  if (options?.referer) headers.Referer = options.referer;
  if (options?.cookie) headers.Cookie = options.cookie;

  const res = await fetchWithTimeout(
    url,
    { headers, redirect: "follow" },
    25_000,
  );

  if (!res.ok) {
    throw new HttpError(502, `فشل الجلب HTTP ${res.status}`);
  }

  const html = await res.text();
  if (!html || html.length < 500) {
    throw new HttpError(502, "صفحة فارغة من المتجر");
  }

  return html;
}

export function isBlockedMarketplaceHtml(html: string): boolean {
  const short = html.length < 12_000;
  return (
    html.includes("_____tmd_____/punish") ||
    html.includes("x5secdata") ||
    html.includes("cdn-cgi/challenge-platform") ||
    (short && /captcha|verify you are human|access denied/i.test(html))
  );
}

export function normalizeImageUrl(src?: string): string {
  if (!src) return "";
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http")) return trimmed;
  if (trimmed.startsWith("/")) return `https:${trimmed}`;
  return trimmed;
}
