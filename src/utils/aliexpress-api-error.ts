/** Normalize AliExpress IOP errors from /sync and /rest gateways. */
export function extractAliExpressApiError(json: Record<string, unknown>):
  | { code?: string | number; msg?: string; sub_msg?: string }
  | undefined {
  const nested = json.error_response as
    | { code?: string | number; msg?: string; sub_msg?: string }
    | undefined;
  if (nested) return nested;

  const code = json.code;
  const message = json.message;
  if (
    (json.type === "ISV" || typeof code === "string" || typeof code === "number") &&
    typeof message === "string"
  ) {
    return { code: code as string | number, msg: message };
  }

  return undefined;
}

export function isAliExpressAuthError(message: string): boolean {
  return /access token|IllegalAccessToken|invalid or expired|MissingParameter.*access_token/i.test(
    message,
  );
}

export function isAliExpressSignatureError(message: string): boolean {
  return /signature|IncompleteSignature|platform standards/i.test(message);
}
