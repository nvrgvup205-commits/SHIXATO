import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { Hono } from "hono";
import { requireHttps } from "../middleware/aliexpress-auth";
import {
  getAliExpressCredentialStatus,
  hasAliExpressAppCredentials,
  loadAliExpressCredentials,
  resolveAliExpressCallbackUrl,
  saveAliExpressTokens,
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

/** صفحة إعداد — اعرض القيم الدقيقة لنسخها في AliExpress Console */
aliexpressAuth.get("/aliexpress/setup", async (c) => {
  const status = await getAliExpressCredentialStatus(c.env);
  const creds = status.configured ? await loadAliExpressCredentials(c.env) : null;
  const callbackUrl = resolveAliExpressCallbackUrl(c.env);
  const appKey = creds?.appKey ?? c.env.ALIEXPRESS_APP_KEY ?? "—";

  return c.html(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إعداد AliExpress OAuth</title></head>
<body style="font-family:sans-serif;padding:2rem;max-width:760px;line-height:1.7">
  <h1>إعداد Callback URL — SHIXATO</h1>
  <p>الخطأ <strong>Redirect uri does not match</strong> يعني أن الرابط في AliExpress Console <em>مختلف حرفياً</em> عن اللي السيرفر بيبعته.</p>

  <h2>انسخ هذا الرابط بالضبط في AliExpress Console → App Settings → Callback URL:</h2>
  <pre id="cb" style="background:#f4f4f4;padding:1rem;overflow:auto;direction:ltr;text-align:left;font-size:15px;border:2px solid #0f8a6a;border-radius:8px">${callbackUrl}</pre>
  <button onclick="navigator.clipboard.writeText(document.getElementById('cb').textContent);this.textContent='تم النسخ ✅'" style="padding:.5rem 1rem;cursor:pointer">نسخ Callback URL</button>

  <h2>App Key (يجب أن يطابق)</h2>
  <pre style="background:#f4f4f4;padding:.75rem;direction:ltr">${appKey}</pre>

  <h2>تحقق من هذه النقاط</h2>
  <ul>
    <li>✅ يبدأ بـ <code>https://</code> (مش http)</li>
    <li>✅ بدون <code>/</code> في الآخر</li>
    <li>✅ المسار: <code>/api/aliexpress/callback</code> (مش <code>/api/auth/aliexpress/callback</code>)</li>
    <li>✅ النطاق: <code>shixato.nvrgvup205.workers.dev</code> (بحرف v — مش nvrgyup)</li>
    <li>✅ App Key في Console = App Key في Cloudflare</li>
  </ul>

  <p>بعد الحفظ في AliExpress انتظر 2–5 دقائق ثم جرّب:</p>
  <p><a href="/api/auth/aliexpress/connect" style="font-size:18px">← اضغط هنا لربط OAuth</a></p>
  <p><a href="/dashboard">العودة للداشبورد</a></p>
  <hr>
  <p style="color:#666;font-size:13px">تشخيص: configured=${status.configured}, envKey=${status.hasEnvAppKey}, envSecret=${status.hasEnvAppSecret}</p>
</body></html>`);
});

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
  const workerOrigin = new URL(c.req.url).origin;

  return c.json({
    ok: true,
    data: {
      ...status,
      callbackUrl: resolveAliExpressCallbackUrl(c.env),
      hasAccessToken: Boolean(creds?.accessToken || tokenRow?.access_token),
      tokenExpiresAt: creds?.tokenExpiresAt ?? tokenRow?.expires_at ?? null,
      connectUrl: "/api/auth/aliexpress/connect",
      appKey: creds?.appKey ?? null,
      expectedAppKey: status.expectedAppKey,
      appKeyMatches: status.appKeyMatches,
      secretSource: status.secretSource,
      secretLength: status.secretLength,
      mode: creds?.accessToken ? "api_ready" : status.configured ? "needs_token" : "needs_credentials",
      links: {
        dashboard: `${workerOrigin}/dashboard`,
        oauthConnect: `${workerOrigin}/api/auth/aliexpress/connect`,
        aliexpressApps: "https://openservice.aliexpress.com/app/list",
        aliexpressDocs: "https://openservice.aliexpress.com/doc/doc.htm",
        dsCenter: "https://ds.aliexpress.com/",
        cloudflareWorker: "https://dash.cloudflare.com/",
      },
    },
  });
});

/** حفظ Access Token يدوياً (من API Testing Tool في AliExpress Console) */
aliexpressAuth.post("/aliexpress/token", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };

  const accessToken = String(body.accessToken ?? "").trim();
  if (accessToken.length < 8) {
    return c.json({ ok: false, error: "accessToken مطلوب (من AliExpress API Testing Tool)" }, 400);
  }

  const configured = await hasAliExpressAppCredentials(c.env);
  if (!configured) {
    return c.json(
      { ok: false, error: "أضف AppKey و AppSecret أولاً في Cloudflare Secrets" },
      500,
    );
  }

  const creds = await loadAliExpressCredentials(c.env);
  if (!creds) {
    return c.json({ ok: false, error: "AliExpress credentials missing" }, 500);
  }

  const expiresAt = body.expiresAt?.trim() || null;
  await saveAliExpressTokens(c.env, {
    accessToken,
    refreshToken: body.refreshToken?.trim() || null,
    expiresAt,
  });

  const oauth = new AliExpressOAuth({
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    callbackUrl: creds.callbackUrl,
  });

  const check = await oauth.validateToken(accessToken, { expiresAt });

  await auditOAuth(
    c.env,
    "aliexpress_oauth:manual_token",
    { has_refresh_token: Boolean(body.refreshToken), valid: check.valid },
    check.valid ? "success" : "partial",
    check.valid ? undefined : check.error ?? "Token saved but validation call failed",
  );

  return c.json({
    ok: true,
    data: {
      saved: true,
      valid: check.valid,
      expiresAt,
      error: check.error ?? null,
      message_ar: check.valid
        ? "تم حفظ التوكن — APIs الرسمية جاهزة ✅"
        : `تم الحفظ لكن التحقق فشل: ${check.error ?? "تأكد أنك لصقت access_token وليس code"}`,
    },
  });
});

/** اختبار التوكن المحفوظ — يُرجع رسالة الخطأ الحقيقية من AliExpress */
aliexpressAuth.get("/aliexpress/test", requireAuth, async (c) => {
  const creds = await loadAliExpressCredentials(c.env);
  if (!creds?.accessToken) {
    return c.json({ ok: false, error: "لا يوجد token محفوظ" }, 401);
  }

  const oauth = new AliExpressOAuth({
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    callbackUrl: creds.callbackUrl,
  });

  const check = await oauth.validateToken(creds.accessToken, {
    expiresAt: creds.tokenExpiresAt,
  });

  const signatureError = /signature|IncompleteSignature|platform standards/i.test(
    check.error ?? "",
  );
  const tokenError = /access token|IllegalAccessToken|invalid or expired/i.test(
    check.error ?? "",
  );

  return c.json({
    ok: check.valid,
    data: {
      valid: check.valid,
      error: check.error ?? null,
      errorKind: check.valid
        ? "ok"
        : signatureError
          ? "bad_app_secret"
          : tokenError
            ? "bad_access_token"
            : "unknown",
      appKey: creds.appKey,
      secretLength: creds.appSecret.length,
      tokenPreview: creds.accessToken.slice(0, 8) + "…",
      expiresAt: creds.tokenExpiresAt,
      hintAr: signatureError
        ? "App Secret في Cloudflare لا يطابق Console — أعد لصقه (البصمة المطلوبة: df536a0b324c)"
        : tokenError
          ? "App Secret صحيح — Access Token منتهي. اعمل OAuth من جديد (لا تلصق App Secret في خانة التوكن)"
          : check.valid
            ? null
            : check.error ?? "فشل التحقق",
    },
  });
});

/** فحص AppKey + AppSecret بدون كشف السر */
aliexpressAuth.get("/aliexpress/credentials-check", requireAuth, async (c) => {
  const status = await getAliExpressCredentialStatus(c.env);
  const creds = status.configured ? await loadAliExpressCredentials(c.env) : null;

  if (!creds?.appSecret) {
    return c.json({
      ok: false,
      error: "ALIEXPRESS_APP_SECRET مفقود في Cloudflare Secrets",
      data: {
        ...status,
        signatureOk: false,
        hintAr: "أضف App Secret من AliExpress Console → Advanced Information",
      },
    });
  }

  const oauth = new AliExpressOAuth({
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    callbackUrl: creds.callbackUrl,
  });

  const secretProbe = await oauth.probeAppSecret();
  const probe = creds.accessToken
    ? await oauth.validateToken(creds.accessToken, { expiresAt: creds.tokenExpiresAt })
    : { valid: false, error: "no_token" };

  const signatureError =
    !secretProbe.signatureOk ||
    /signature|IncompleteSignature|platform standards/i.test(probe.error ?? "");

  return c.json({
    ok: secretProbe.signatureOk && (probe.valid || !creds.accessToken),
    data: {
      ...status,
      signatureOk: secretProbe.signatureOk,
      tokenValid: probe.valid,
      probeError: secretProbe.error ?? probe.error ?? null,
      hintAr: !secretProbe.signatureOk
        ? "التوقيع فشل — App Secret لا يطابق AppKey 542618. الصق Secret من Console في Cloudflare ثم Deploy."
        : !creds.accessToken
          ? "App Secret صحيح ✅ — اعمل OAuth للحصول على Access Token"
          : probe.valid
            ? "كل شيء يعمل ✅"
            : "App Secret صحيح — Access Token منتهي. اعمل OAuth من جديد",
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
