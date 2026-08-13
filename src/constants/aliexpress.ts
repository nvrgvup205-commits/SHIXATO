/**
 * Canonical AliExpress App Key for SHIXATO (Shixato app in Open Platform).
 * Must match AliExpress Console AND Cloudflare Worker vars.
 * App Key is public — never put App Secret here.
 */
export const SHIXATO_ALIEXPRESS_APP_KEY = "542618";

export function isExpectedAliExpressAppKey(appKey: string | null | undefined): boolean {
  return String(appKey ?? "").trim() === SHIXATO_ALIEXPRESS_APP_KEY;
}
