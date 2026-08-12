/** Small HTTP helpers for the Worker */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return Response.json(
    { ok: false, error: message, details: details ?? null },
    { status },
  );
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const ALIEXPRESS_ITEM_HOST = "www.aliexpress.com";

/** Canonical public product page — always `www.aliexpress.com`, never tracking slugs */
export function canonicalAliExpressProductUrl(aliexpressId: string): string {
  const id = aliexpressId.replace(/\D/g, "");
  if (!/^\d{6,20}$/.test(id)) {
    throw new Error(`Invalid AliExpress product id: ${aliexpressId}`);
  }
  return `https://${ALIEXPRESS_ITEM_HOST}/item/${id}.html`;
}

/** Resolve any AE item URL / id to the canonical product page */
export function resolveAliExpressProductUrl(
  rawUrl?: string | null,
  aliexpressId?: string | null,
): string | null {
  const fromId = aliexpressId ? extractAliExpressId(aliexpressId) : null;
  const fromUrl = rawUrl ? extractAliExpressId(rawUrl) : null;
  const id = fromId ?? fromUrl;
  if (!id) return null;
  return canonicalAliExpressProductUrl(id);
}

export function extractAliExpressId(input: string): string | null {
  let trimmed = input.trim();
  if (/^\d{6,20}$/.test(trimmed)) return trimmed;

  if (trimmed.startsWith("//")) trimmed = `https:${trimmed}`;
  if (trimmed.startsWith("/item/")) {
    trimmed = `https://${ALIEXPRESS_ITEM_HOST}${trimmed}`;
  }

  try {
    const url = new URL(trimmed);
    const fromPath = url.pathname.match(/\/item\/(\d{6,20})\.html/i);
    if (fromPath?.[1]) return fromPath[1];

    const fromQuery =
      url.searchParams.get("productId") ?? url.searchParams.get("id");
    if (fromQuery && /^\d{6,20}$/.test(fromQuery)) return fromQuery;
  } catch {
    // not a URL
  }

  const loose = trimmed.match(/\/item\/(\d{6,20})\.html/i);
  if (loose?.[1]) return loose[1];

  const digits = trimmed.match(/(\d{10,20})/);
  return digits?.[1] ?? null;
}

export function applyMarkup(price: number, markup: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const factor = Number.isFinite(markup) && markup > 0 ? markup : 1.4;
  return Math.round(price * factor * 100) / 100;
}

export function clampImages(images: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const img of images) {
    if (!img || seen.has(img)) continue;
    seen.add(img);
    out.push(img);
    if (out.length >= max) break;
  }
  return out;
}
