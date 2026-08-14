import type { Context, MiddlewareHandler } from "hono";
import {
  hasAliExpressAppCredentials,
  invalidateAliExpressCredentialsCache,
  loadAliExpressCredentials,
} from "../services/aliexpress-credentials";
import { AliExpressOAuth } from "../services/aliexpress-oauth";
import { SupabaseService } from "../services/supabase";
import type { Env } from "../types";
import { HttpError } from "../utils/http";

export type AliExpressAuthVariables = {
  aliexpressAccessToken: string;
  aliexpressRefreshToken: string | null;
  aliexpressTokenExpiresAt: string | null;
};

type AliExpressAuthEnv = { Bindings: Env; Variables: AliExpressAuthVariables };

/**
 * Middleware: يتأكد أن AliExpress OAuth token موجود وصالح.
 * - يجدد التوكن تلقائياً إذا انتهت صلاحيته
 * - يرجع 401 إذا لا يوجد token
 */
export function requireAliExpressToken(): MiddlewareHandler<AliExpressAuthEnv> {
  return async (c, next) => {
    const configured = await hasAliExpressAppCredentials(c.env);
    if (!configured) {
      return c.json(
        {
          ok: false,
          error: "AliExpress API غير مضبوط — أضف AppKey و AppSecret",
        },
        500,
      );
    }

    const creds = await loadAliExpressCredentials(c.env);
    if (!creds) {
      return c.json({ ok: false, error: "AliExpress credentials missing" }, 500);
    }

    let accessToken = creds.accessToken?.trim() || null;
    let refreshToken = creds.refreshToken;
    let expiresAt = creds.tokenExpiresAt;

    if (!accessToken) {
      return c.json(
        {
          ok: false,
          error:
            "AliExpress غير مربوط — افتح /api/auth/aliexpress/connect وسجّل الدخول",
          connectUrl: "/api/auth/aliexpress/connect",
        },
        401,
      );
    }

    const oauth = new AliExpressOAuth({
      appKey: creds.appKey,
      appSecret: creds.appSecret,
      callbackUrl: creds.callbackUrl,
    });

    const expired =
      expiresAt != null &&
      Number.isFinite(Date.parse(expiresAt)) &&
      Date.parse(expiresAt) <= Date.now() + 60_000;

    if (expired && refreshToken) {
      try {
        const refreshed = await oauth.refreshAccessToken(refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
        await persistRefreshedToken(c.env, refreshed);
      } catch (err) {
        const message =
          err instanceof HttpError ? err.message : "تعذّر تجديد AliExpress token";
        return c.json(
          {
            ok: false,
            error: message,
            connectUrl: "/api/auth/aliexpress/connect",
          },
          401,
        );
      }
    } else if (expired) {
      return c.json(
        {
          ok: false,
          error: "انتهت صلاحية AliExpress token — أعد الربط",
          connectUrl: "/api/auth/aliexpress/connect",
        },
        401,
      );
    } else {
      const check = await oauth.validateToken(accessToken, { expiresAt });
      if (!check.valid && refreshToken) {
        try {
          const refreshed = await oauth.refreshAccessToken(refreshToken);
          accessToken = refreshed.accessToken;
          refreshToken = refreshed.refreshToken ?? refreshToken;
          expiresAt = refreshed.expiresAt;
          await persistRefreshedToken(c.env, refreshed);
        } catch {
          return c.json(
            {
              ok: false,
              error: "AliExpress token غير صالح — أعد الربط",
              connectUrl: "/api/auth/aliexpress/connect",
            },
            401,
          );
        }
      } else if (!check.valid) {
        return c.json(
          {
            ok: false,
            error: "AliExpress token غير صالح — أعد الربط",
            connectUrl: "/api/auth/aliexpress/connect",
          },
          401,
        );
      }
    }

    c.set("aliexpressAccessToken", accessToken);
    c.set("aliexpressRefreshToken", refreshToken);
    c.set("aliexpressTokenExpiresAt", expiresAt);

    await next();
  };
}

/** يفرض HTTPS في الإنتاج (OAuth callbacks يجب أن تكون آمنة) */
export function requireHttps(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol;
    const isProd = (c.env.ENVIRONMENT ?? "production") === "production";
    if (isProd && !String(proto).startsWith("https")) {
      return c.json({ ok: false, error: "HTTPS مطلوب لـ OAuth" }, 400);
    }
    await next();
  };
}

async function persistRefreshedToken(
  env: Env,
  token: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
  },
): Promise<void> {
  const db = new SupabaseService(env);
  await db.saveAliExpressToken({
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
  });
  invalidateAliExpressCredentialsCache();
}

export function getAliExpressTokenFromContext(
  c: Context<AliExpressAuthEnv>,
): string {
  return c.get("aliexpressAccessToken");
}
