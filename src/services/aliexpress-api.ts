import { signAliExpressRequest } from "../utils/aliexpress-sign";
import { fetchWithTimeout, HttpError } from "../utils/http";
import type { AliExpressCredentials } from "./aliexpress-credentials";

const REST_BASE = "https://api-sg.aliexpress.com/rest";
const SYNC_BASE = "https://api-sg.aliexpress.com/sync";
const OAUTH_AUTHORIZE = "https://api-sg.aliexpress.com/oauth/authorize";

export type AliExpressTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expire_time?: string | number;
  expires_in?: string | number;
  refresh_expires_in?: string | number;
  code?: string;
  message?: string;
  request_id?: string;
};

export type AliExpressFreightOption = {
  serviceName: string;
  estimatedDeliveryTime?: string;
  amount?: number;
  currency?: string;
  trackingAvailable?: boolean;
};

export class AliExpressApiClient {
  constructor(private readonly creds: AliExpressCredentials) {}

  buildAuthorizeUrl(state?: string): string {
    const redirectUri = this.creds.callbackUrl;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.creds.appKey,
      redirect_uri: redirectUri,
      force_auth: "true",
    });
    if (state) params.set("state", state);
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  }

  async createTokenFromCode(code: string): Promise<AliExpressTokenResponse> {
    return this.callRest("/auth/token/create", { code });
  }

  async refreshToken(refreshToken?: string | null): Promise<AliExpressTokenResponse> {
    const token = refreshToken ?? this.creds.refreshToken;
    if (!token) {
      throw new HttpError(400, "لا يوجد refresh token — أعد ربط حساب AliExpress");
    }
    return this.callRest("/auth/token/refresh", { refresh_token: token });
  }

  async getProduct(productId: string, shipToCountry = "SA", targetCurrency = "USD") {
    this.requireAccessToken();
    return this.callSync("aliexpress.ds.product.get", {
      product_id: productId,
      ship_to_country: shipToCountry,
      target_currency: targetCurrency,
      target_language: "EN",
    });
  }

  async calculateFreight(input: {
    productId: string;
    quantity?: number;
    shipToCountry?: string;
    provinceCode?: string;
    cityCode?: string;
    price?: string;
    productNum?: number;
  }): Promise<AliExpressFreightOption[]> {
    this.requireAccessToken();
    const payload = {
      country_code: (input.shipToCountry || "SA").toUpperCase(),
      product_id: input.productId,
      product_num: input.quantity ?? input.productNum ?? 1,
      ...(input.provinceCode ? { province_code: input.provinceCode } : {}),
      ...(input.cityCode ? { city_code: input.cityCode } : {}),
      ...(input.price ? { price: input.price } : {}),
    };

    const raw = await this.callSync("aliexpress.logistics.buyer.freight.calculate", {
      param_aeop_freight_calculate_for_buyer_d_t_o: JSON.stringify(payload),
    });

    return this.parseFreightResponse(raw);
  }

  private requireAccessToken(): void {
    if (!this.creds.accessToken) {
      throw new HttpError(
        401,
        "AliExpress غير مربوط بعد — افتح /api/auth/aliexpress/connect وسجّل الدخول",
      );
    }
  }

  private async callRest(
    apiPath: string,
    apiParams: Record<string, string>,
  ): Promise<AliExpressTokenResponse> {
    const timestamp = String(Date.now());
    const params: Record<string, string> = {
      app_key: this.creds.appKey,
      timestamp,
      sign_method: "sha256",
      ...apiParams,
    };
    params.sign = await signAliExpressRequest(apiPath, params, this.creds.appSecret);

    const body = new URLSearchParams(params);
    const res = await fetchWithTimeout(`${REST_BASE}${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body,
    });

    const json = (await res.json().catch(() => ({}))) as AliExpressTokenResponse & {
      error_response?: { msg?: string; sub_msg?: string; code?: number };
    };

    if (!res.ok) {
      throw new HttpError(
        502,
        json.error_response?.sub_msg ||
          json.error_response?.msg ||
          json.message ||
          "AliExpress token request failed",
        json,
      );
    }

    if (json.code && json.code !== "0" && !json.access_token) {
      throw new HttpError(502, json.message || "AliExpress token request failed", json);
    }

    return json;
  }

  /** Signed IOP sync call (public for higher-level clients). */
  async callSync(
    method: string,
    apiParams: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const timestamp = String(Date.now());
    const params: Record<string, string> = {
      app_key: this.creds.appKey,
      timestamp,
      sign_method: "sha256",
      method,
      ...apiParams,
    };
    if (this.creds.accessToken) {
      params.session = this.creds.accessToken;
    }
    params.sign = await signAliExpressRequest(method, params, this.creds.appSecret);

    const body = new URLSearchParams(params);
    const res = await fetchWithTimeout(SYNC_BASE, {
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
        error?.sub_msg || error?.msg || "AliExpress API request failed",
        json,
      );
    }

    return json;
  }

  private parseFreightResponse(raw: Record<string, unknown>): AliExpressFreightOption[] {
    const response =
      (raw.aliexpress_logistics_buyer_freight_calculate_response as Record<string, unknown>) ||
      (raw.result as Record<string, unknown>) ||
      raw;
    const result = (response.result as Record<string, unknown>) || response;
    const list =
      (result.aeop_freight_calculate_result_for_buyer_d_t_o_list as unknown[]) ||
      (result.aeop_freight_calculate_result_list as unknown[]) ||
      [];

    return list
      .map((item) => {
        const row = item as Record<string, unknown>;
        const freight = (row.freight as Record<string, unknown>) || {};
        return {
          serviceName: String(
            row.service_name || row.logistics_service_name || row.company || "unknown",
          ),
          estimatedDeliveryTime: row.estimated_delivery_time
            ? String(row.estimated_delivery_time)
            : undefined,
          amount: freight.amount != null ? Number(freight.amount) : undefined,
          currency: freight.currency_code ? String(freight.currency_code) : undefined,
          trackingAvailable:
            row.tracking_available === true || row.tracking_available === "true",
        } satisfies AliExpressFreightOption;
      })
      .filter((row) => row.serviceName !== "unknown" || row.amount != null);
  }
}
