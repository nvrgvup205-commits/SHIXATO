/** HMAC-SHA256 signing for AliExpress IOP REST/sync APIs. */

export function sortAliExpressParams(
  params: Record<string, string | undefined>,
): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (key === "sign" || value == null || value === "") continue;
    sorted[key] = value;
  }
  return sorted;
}

export function buildAliExpressSignBase(
  apiName: string,
  params: Record<string, string | undefined>,
): string {
  let base = apiName;
  for (const [key, value] of Object.entries(sortAliExpressParams(params))) {
    base += `${key}${value}`;
  }
  return base;
}

export async function signAliExpressRequest(
  apiName: string,
  params: Record<string, string | undefined>,
  appSecret: string,
): Promise<string> {
  const base = buildAliExpressSignBase(apiName, params);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(base));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
