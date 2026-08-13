import { signAliExpressRequest } from "../utils/aliexpress-sign";
import { ALIEXPRESS_BUSINESS_REST_BASE } from "../constants/aliexpress";
import {
  extractAliExpressApiError,
  isAliExpressSignatureError,
  isAliExpressAuthError,
} from "../utils/aliexpress-api-error";
import { fetchWithTimeout, HttpError } from "../utils/http";
import { sleep } from "../utils/rate-limiter";

/** AliExpress Open Platform OAuth endpoints (official docs). */
export const ALIEXPRESS_OAUTH_AUTHORIZE_URL =
  "https://api-sg.aliexpress.com/oauth/authorize";
/** Signed token APIs live under /rest — AliExpress docs call this the token exchange step. */
export const ALIEXPRESS_OAUTH_TOKEN_REST_BASE = "https://api-sg.aliexpress.com/rest";
export const ALIEXPRESS_OAUTH_TOKEN_CREATE_PATH = "/auth/token/create";
export const ALIEXPRESS_OAUTH_TOKEN_REFRESH_PATH = "/auth/token/refresh";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 400;

export type AliExpressOAuthConfig = {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
};

export type AliExpressOAuthToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  raw: AliExpressTokenApiResponse;
};

export type AliExpressTokenApiResponse = {
  access_token?: string;
  refresh_token?: string;
  expire_time?: string | number;
  expires_in?: string | number;
  refresh_expires_in?: string | number;
  refresh_token_valid_time?: string | number;
  code?: string;
  message?: string;
  request_id?: string;
  error_response?: { msg?: string; sub_msg?: string; code?: number };
};

/**
 * AliExpress Open Platform OAuth helper.
 * يبني رابط التفويض، يستبدل الكود بـ access token، ويتحقق من صلاحية التوكن.
 */
export class AliExpressOAuth {
  constructor(private readonly config: AliExpressOAuthConfig) {}

  /** 1) بناء رابط تسجيل الدخول والتفويض على AliExpress */
  getAuthorizationUrl(state: string): string {
    const redirectUri = this.config.callbackUrl.trim();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.appKey,
      redirect_uri: redirectUri,
      force_auth: "true",
      state,
    });
    return `${ALIEXPRESS_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  }

  /** 2) استبدال authorization code بـ access token (مع إعادة المحاولة عند أخطاء الشبكة) */
  async exchangeCodeForToken(code: string): Promise<AliExpressOAuthToken> {
    const trimmed = code.trim();
    if (!trimmed) {
      throw new HttpError(400, "authorization code فارغ أو غير صالح");
    }

    const raw = await this.withRetry(() =>
      this.postSignedRest(ALIEXPRESS_OAUTH_TOKEN_CREATE_PATH, { code: trimmed }),
    );

    return this.normalizeTokenResponse(raw);
  }

  /** 3) تجديد access token عبر refresh token */
  async refreshAccessToken(refreshToken: string): Promise<AliExpressOAuthToken> {
    const trimmed = refreshToken.trim();
    if (!trimmed) {
      throw new HttpError(400, "refresh token مفقود");
    }

    const raw = await this.withRetry(() =>
      this.postSignedRest(ALIEXPRESS_OAUTH_TOKEN_REFRESH_PATH, {
        refresh_token: trimmed,
      }),
    );

    return this.normalizeTokenResponse(raw);
  }

  /**
   * يتحقق أن AppKey + AppSecret يولّدان توقيعاً مقبولاً (بدون access token).
   */
  async probeAppSecret(): Promise<{ signatureOk: boolean; error?: string }> {
    try {
      await this.postSignedRest(ALIEXPRESS_OAUTH_TOKEN_CREATE_PATH, {
        code: "shixato-signature-probe",
      });
      return { signatureOk: true };
    } catch (err) {
      const msg =
        err instanceof HttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "فشل فحص التوقيع";
      if (/signature|IncompleteSignature|platform standards/i.test(msg)) {
        return { signatureOk: false, error: msg };
      }
      return { signatureOk: true };
    }
  }

  /** DS feed probe without access token — verifies AppKey+Secret on /rest. */
  async probeBusinessSignature(): Promise<{ signatureOk: boolean; error?: string }> {
    try {
      await this.postSignedBusiness(
        "aliexpress.ds.recommend.feed.get",
        {
          feed_name: "DS bestseller",
          country: "SA",
          target_currency: "USD",
          target_language: "EN",
          page_size: "1",
        },
        null,
      );
      return { signatureOk: true };
    } catch (err) {
      const msg =
        err instanceof HttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "فشل فحص التوقيع";
      if (isAliExpressSignatureError(msg)) {
        return { signatureOk: false, error: msg };
      }
      return { signatureOk: true };
    }
  }

  /**
   * 4) التحقق من صلاحية التوكن.
   * - يتحقق من الشكل والانتهاء المحلي
   * - يجرّب استدعاء API خفيف للتأكد أن AliExpress يقبل التوكن
   */
  async validateToken(
    accessToken: string,
    options?: { expiresAt?: string | null },
  ): Promise<{ valid: boolean; error?: string }> {
    const token = accessToken.trim();
    if (!token) return { valid: false, error: "token فارغ" };

    if (options?.expiresAt) {
      const expiresMs = Date.parse(options.expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now() + 30_000) {
        return { valid: false, error: "انتهت صلاحية التوكن" };
      }
    }

    const probes: Array<{
      method: string;
      params: Record<string, string>;
      accessToken: string;
    }> = [
      {
        method: "aliexpress.ds.product.get",
        params: {
          product_id: "1005006123456789",
          ship_to_country: "SA",
          target_currency: "USD",
          target_language: "EN",
        },
        accessToken: token,
      },
    ];

    let lastError = "AliExpress رفض التوكن";
    for (const probe of probes) {
      try {
        await this.withRetry(() =>
          this.postSignedBusiness(probe.method, probe.params, probe.accessToken),
        );
        return { valid: true };
      } catch (err) {
        lastError =
          err instanceof HttpError ? err.message : "فشل التحقق من التوكن";
        if (isAliExpressSignatureError(lastError)) {
          return { valid: false, error: lastError };
        }
        if (!isAliExpressAuthError(lastError)) {
          return { valid: true };
        }
      }
    }

    return { valid: false, error: lastError };
  }

  /** توقيع state parameter لمنع CSRF (AliExpress لا يتطلب PKCE حالياً) */
  async signOAuthState(nonce: string): Promise<string> {
    const sig = await signAliExpressRequest(
      "oauth-state",
      { nonce },
      this.config.appSecret,
    );
    return `${nonce}.${sig.slice(0, 24)}`;
  }

  async verifyOAuthState(state: string, maxAgeMs = 10 * 60 * 1000): Promise<boolean> {
    const [nonce, sig] = state.split(".");
    if (!nonce || !sig || !/^[a-f0-9-]{16,}$/i.test(nonce)) return false;

    const issuedAt = Number(nonce.split("-")[0]);
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > maxAgeMs) {
      return false;
    }

    const expected = await this.signOAuthState(nonce);
    return expected === state;
  }

  async createOAuthState(): Promise<string> {
    const nonce = `${Date.now()}-${crypto.randomUUID()}`;
    return this.signOAuthState(nonce);
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const retryable =
          err instanceof TypeError ||
          (err instanceof HttpError &&
            (err.status >= 500 || err.status === 408 || err.status === 429));
        if (!retryable || attempt === MAX_RETRIES - 1) break;
        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
    }
    throw lastError;
  }

  private async postSignedRest(
    apiPath: string,
    apiParams: Record<string, string>,
  ): Promise<AliExpressTokenApiResponse> {
    const timestamp = String(Date.now());
    const params: Record<string, string> = {
      app_key: this.config.appKey,
      timestamp,
      sign_method: "sha256",
      ...apiParams,
    };
    params.sign = await signAliExpressRequest(apiPath, params, this.config.appSecret);

    const body = new URLSearchParams(params);
    const res = await fetchWithTimeout(
      `${ALIEXPRESS_OAUTH_TOKEN_REST_BASE}${apiPath}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body,
      },
    );

    const json = (await res.json().catch(() => ({}))) as AliExpressTokenApiResponse;

    if (!res.ok) {
      throw new HttpError(
        502,
        json.error_response?.sub_msg ||
          json.error_response?.msg ||
          json.message ||
          "فشل طلب OAuth token من AliExpress",
        json,
      );
    }

    if (json.code && json.code !== "0" && !json.access_token) {
      throw new HttpError(
        502,
        json.message || "AliExpress رفض استبدال الكود",
        json,
      );
    }

    return json;
  }

  private async postSignedBusiness(
    method: string,
    apiParams: Record<string, string>,
    accessToken: string | null,
  ): Promise<Record<string, unknown>> {
    const timestamp = String(Date.now());
    const params: Record<string, string> = {
      app_key: this.config.appKey,
      timestamp,
      sign_method: "sha256",
      method,
      ...apiParams,
    };
    if (accessToken) {
      params.access_token = accessToken;
    }
    params.sign = await signAliExpressRequest(method, params, this.config.appSecret);

    const body = new URLSearchParams(params);
    const res = await fetchWithTimeout(ALIEXPRESS_BUSINESS_REST_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body,
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const error = extractAliExpressApiError(json);

    if (!res.ok || error) {
      const msg = error?.sub_msg || error?.msg || "AliExpress API رفض التوكن";
      throw new HttpError(502, msg, json);
    }

    return json;
  }

  private normalizeTokenResponse(raw: AliExpressTokenApiResponse): AliExpressOAuthToken {
    const payload = unwrapAliExpressTokenPayload(raw);
    const accessToken = sanitizeAccessToken(payload.access_token);
    if (!accessToken) {
      throw new HttpError(502, "AliExpress لم يُرجع access_token", payload);
    }

    const expiresAt = resolveTokenExpiry(payload);

    return {
      accessToken,
      refreshToken: payload.refresh_token?.trim() || null,
      expiresAt,
      raw: payload,
    };
  }
}

export function unwrapAliExpressTokenPayload(
  raw: AliExpressTokenApiResponse & { gopResponseBody?: string },
): AliExpressTokenApiResponse {
  if (raw.access_token?.trim()) return raw;
  const body = raw.gopResponseBody;
  if (typeof body === "string" && body.trim()) {
    try {
      return JSON.parse(body) as AliExpressTokenApiResponse;
    } catch {
      // fall through
    }
  }
  return raw;
}

export function sanitizeAccessToken(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\x20-\x7E]/g, "").trim();
  return cleaned || null;
}

export function resolveTokenExpiry(raw: AliExpressTokenApiResponse): string | null {
  if (raw.expire_time != null) {
    const asNumber = Number(raw.expire_time);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      const ms =
        asNumber > 1_000_000_000_000
          ? asNumber
          : asNumber > 1_000_000_000
            ? asNumber * 1000
            : asNumber;
      return new Date(ms).toISOString();
    }
    const parsed = Date.parse(String(raw.expire_time).trim().replace(" ", "T"));
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (raw.expires_in != null) {
    const seconds = Number(raw.expires_in);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
  }
  return null;
}
