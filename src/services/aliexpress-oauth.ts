import { signAliExpressRequest } from "../utils/aliexpress-sign";
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
   * 4) التحقق من صلاحية التوكن.
   * - يتحقق من الشكل والانتهاء المحلي
   * - يجرّب استدعاء API خفيف للتأكد أن AliExpress يقبل التوكن
   */
  async validateToken(
    accessToken: string,
    options?: { expiresAt?: string | null },
  ): Promise<boolean> {
    const token = accessToken.trim();
    if (!token) return false;

    if (options?.expiresAt) {
      const expiresMs = Date.parse(options.expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now() + 30_000) {
        return false;
      }
    }

    try {
      await this.withRetry(() =>
        this.postSignedSync("aliexpress.ds.recommend.feed.get", {
          feed_name: "DS bestseller",
          page_size: "1",
        }, token),
      );
      return true;
    } catch {
      return false;
    }
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

  private async postSignedSync(
    method: string,
    apiParams: Record<string, string>,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const timestamp = String(Date.now());
    const params: Record<string, string> = {
      app_key: this.config.appKey,
      timestamp,
      sign_method: "sha256",
      method,
      session: accessToken,
      ...apiParams,
    };
    params.sign = await signAliExpressRequest(method, params, this.config.appSecret);

    const body = new URLSearchParams(params);
    const res = await fetchWithTimeout("https://api-sg.aliexpress.com/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body,
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const error = json.error_response as
      | { msg?: string; sub_msg?: string; code?: number }
      | undefined;

    if (!res.ok || error) {
      throw new HttpError(
        502,
        error?.sub_msg || error?.msg || "AliExpress API رفض التوكن",
        json,
      );
    }

    return json;
  }

  private normalizeTokenResponse(raw: AliExpressTokenApiResponse): AliExpressOAuthToken {
    const accessToken = raw.access_token?.trim();
    if (!accessToken) {
      throw new HttpError(502, "AliExpress لم يُرجع access_token", raw);
    }

    const expiresAt = resolveTokenExpiry(raw);

    return {
      accessToken,
      refreshToken: raw.refresh_token?.trim() || null,
      expiresAt,
      raw,
    };
  }
}

export function resolveTokenExpiry(raw: AliExpressTokenApiResponse): string | null {
  if (raw.expire_time != null) {
    const ms = Number(raw.expire_time);
    if (Number.isFinite(ms) && ms > 0) {
      return new Date(ms).toISOString();
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
