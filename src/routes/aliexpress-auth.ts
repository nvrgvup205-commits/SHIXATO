import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { Hono } from "hono";
import { requireHttps } from "../middleware/aliexpress-auth";
import {
  getAliExpressCredentialStatus,
  hasAliExpressAppCredentials,
  loadAliExpressCredentials,
  resolveAliExpressCallbackUrl,
} from "../services/aliexpress-credentials";
import { AliExpressOAuth } from "../services/aliexpress-oauth";
import { SupabaseService } from "../services/supabase";
import type { Env } from "../types";
import { requireAuth } from "../utils/session";
import { HttpError } from "../utils/http";

const OAUTH_STATE_COOKIE = "ae_oauth_state";
const STATE_MAX_AGE_SEC = 600;

const aliexpressAuth = new Hono<{ Bindings: Env }>();

aliexpressAuth.use("/aliexpress/*", requireHttps());

/** بدء OAuth — إعادة توجيه المستخدم لصفحة تسجيل دخول AliExpress */
aliexpressAuth.get("/aliexpress/connect", async (c) => {
  const configured = await hasAliExpressAppCredentials(c.env);
  if (!configured) {
    const status = await getAliExpressCredentialStatus(c.env);
    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem;max-width:720px;line-height:1.6">
        <h1>AliExpress — محتاج App Secret</h1>
        <p>AppKey موجود، لكن <strong>App Secret</strong> مش واصل للسيرفر.</p>
        <p>أضف <code>ALIEXPRESS_APP_SECRET</code> في Cloudflare Secrets أو Supabase <code>app_settings</code>.</p>
        <p style="color:#666;font-size:14px">تشخيص: env key=${status.hasEnvAppKey}, env secret=${status.hasEnvAppSecret}</p>
        <p><a href="/dashboard">العودة للوحة التحكم</a></p>
      </body></html>`,
      500,
    );
  }

  const creds = await loadAliExpressCredentials(c.env);
  if (!creds) {
    return c.json({ ok: false, error: "AliExpress credentials missing" }, 500);
  }

  const oauth = new AliExpressOAuth({
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    callbackUrl: creds.callbackUrl,
  });

  const state = await oauth.createOAuthState();
  const authorizeUrl = oauth.getAuthorizationUrl(state);

  // حفظ state في cookie آمن للتحقق عند callback (CSRF protection)
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: STATE_MAX_AGE_SEC,
  });

  await auditOAuth(c.env, "aliexpress_oauth:authorize_redirect", {
    callback_url: creds.callbackUrl,
    has_state: true,
  });

  return c.redirect(authorizeUrl, 302);
});

/** Callback — استقبال code من AliExpress واستبداله بـ access token */
aliexpressAuth.get("/aliexpress/callback", handleOAuthCallback);

/** حالة الربط للوحة التحكم */
aliexpressAuth.get("/aliexpress/status", requireAuth, async (c) => {
  const status = await getAliExpressCredentialStatus(c.env);
  const creds = status.configured ? await loadAliExpressCredentials(c.env) : null;
  const db = new SupabaseService(c.env);
  const tokenRow = await db.getAliExpressToken().catch(() => null);

  return c.json({
    ok: true,
    data: {
      ...status,
      callbackUrl: resolveAliExpressCallbackUrl(c.env),
      hasAccessToken: Boolean(creds?.accessToken || tokenRow?.access_token),
      tokenExpiresAt: creds?.tokenExpiresAt ?? tokenRow?.expires_at ?? null,
      connectUrl: "/api/auth/aliexpress/connect",
      appKey: creds?.appKey ?? null,
    },
  });
});

async function handleOAuthCallback(c: Context<{ Bindings: Env }>): Promise<Response> {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const errorDescription = c.req.query("error_description");

  if (error) {
    await auditOAuth(c.env, "aliexpress_oauth:callback_error", {
      error,
      error_description: errorDescription ?? null,
    }, "failed", errorDescription || error);
    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem">
        <h1>فشل ربط AliExpress</h1>
        <p>${escapeHtml(errorDescription || error)}</p>
        <p><a href="/dashboard">العودة للوحة التحكم</a></p>
      </body></html>`,
      400,
    );
  }

  if (!code?.trim()) {
    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem">
        <h1>كود التفويض مفقود</h1>
        <p>AliExpress لم يُرجع authorization code.</p>
        <p><a href="/api/auth/aliexpress/connect">إعادة المحاولة</a></p>
      </body></html>`,
      400,
    );
  }

  const creds = await loadAliExpressCredentials(c.env);
  if (!creds) {
    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem">
        <h1>بيانات التطبيق مفقودة</h1>
        <p>أضف AppKey و AppSecret ثم أعد المحاولة.</p>
      </body></html>`,
      500,
    );
  }

  const oauth = new AliExpressOAuth({
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    callbackUrl: creds.callbackUrl,
  });

  // التحقق من state parameter (لا نعرض التوكن في URL أبداً)
  const cookieState = getCookie(c, OAUTH_STATE_COOKIE);
  if (!state || !cookieState || state !== cookieState) {
    const valid = state ? await oauth.verifyOAuthState(state) : false;
    if (!valid) {
      return c.html(
        `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem">
          <h1>طلب OAuth غير آمن</h1>
          <p>فشل التحقق من state — أعد المحاولة من البداية.</p>
          <p><a href="/api/auth/aliexpress/connect">إعادة الربط</a></p>
        </body></html>`,
        400,
      );
    }
  }

  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });

  try {
    const token = await oauth.exchangeCodeForToken(code);

    const db = new SupabaseService(c.env);
    await db.saveAliExpressToken({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
    });

    await auditOAuth(c.env, "aliexpress_oauth:token_exchange", {
      expires_at: token.expiresAt,
      has_refresh_token: Boolean(token.refreshToken),
    });

    // إعادة توجيه للداشبورد بدون عرض التوكن في URL
    return c.redirect(
      `/dashboard?aliexpress=connected&expires=${encodeURIComponent(token.expiresAt ?? "")}`,
      302,
    );
  } catch (err) {
    const message =
      err instanceof HttpError ? err.message : "تعذّر استبدال كود التفعيل";
    await auditOAuth(
      c.env,
      "aliexpress_oauth:token_exchange",
      { code_received: true },
      "failed",
      message,
    );
    const status =
      err instanceof HttpError && err.status >= 400 && err.status < 600
        ? (err.status as 400 | 401 | 500 | 502)
        : 500;
    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem">
        <h1>فشل ربط AliExpress</h1>
        <p>${escapeHtml(message)}</p>
        <p><a href="/api/auth/aliexpress/connect">إعادة المحاولة</a></p>
      </body></html>`,
      status,
    );
  }
}

async function auditOAuth(
  env: Env,
  action: string,
  payload: Record<string, unknown>,
  status: "success" | "failed" | "partial" = "success",
  errorMessage?: string,
): Promise<void> {
  try {
    const db = new SupabaseService(env);
    await db.createSyncLog({
      action,
      status,
      request_payload: payload,
      response_payload: { ok: status === "success" },
      error_message: errorMessage ?? null,
    });
  } catch {
    // لا نوقف OAuth إذا فشل التسجيل
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { handleOAuthCallback as handleAliExpressOAuthCallback };
export default aliexpressAuth;
