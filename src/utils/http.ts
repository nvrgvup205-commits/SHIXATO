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

export function extractAliExpressId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{10,20}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const fromPath = url.pathname.match(/\/item\/(\d+)\.html/i);
    if (fromPath?.[1]) return fromPath[1];

    const fromQuery =
      url.searchParams.get("productId") ?? url.searchParams.get("id");
    if (fromQuery && /^\d{10,20}$/.test(fromQuery)) return fromQuery;
  } catch {
    // not a URL
  }

  const loose = trimmed.match(/(\d{10,20})/);
  return loose?.[1] ?? null;
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
