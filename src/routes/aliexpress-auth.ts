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
import {
  isAliExpressAuthError,
  isAliExpressSignatureError,
} from "../utils/aliexpress-api-error";

const OAUTH_STATE_COOKIE = "ae_oauth_state";
const STATE_MAX_AGE_SEC = 600;

const aliexpressAuth = new Hono<{ Bindings: Env }>();

aliexpressAuth.use("/aliexpress/*", requireHttps());

/** صفحة إعداد — دليل خطوة بخطوة (لا تحتاج تفهم التوكن يدوياً) */
aliexpressAuth.get("/aliexpress/setup", async (c) => {
  const status = await getAliExpressCredentialStatus(c.env);
  const creds = status.configured ? await loadAliExpressCredentials(c.env) : null;
  const callbackUrl = resolveAliExpressCallbackUrl(c.env);
  const appKey = creds?.appKey ?? c.env.ALIEXPRESS_APP_KEY ?? "—";
  const workerOrigin = new URL(c.req.url).origin;

  return c.html(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إعداد AliExpress — SHIXATO</title>
<style>
body{font-family:system-ui,sans-serif;padding:2rem;max-width:820px;line-height:1.75;color:#1a1a1a}
h1,h2{margin-top:1.5rem}
.step{border:1px solid #d8e6e0;border-radius:12px;padding:1rem 1.1rem;margin:1rem 0;background:#f8fcfa}
.step b{color:#0f8a6a}
pre{background:#f4f4f4;padding:.85rem;overflow:auto;direction:ltr;text-align:left;font-size:14px;border-radius:8px}
.btn{display:inline-block;padding:.55rem 1rem;background:#0f8a6a;color:#fff;text-decoration:none;border-radius:8px;margin:.35rem .15rem}
.warn{background:#fff8e6;border-color:#f0d78c}
.ok{background:#e8f8f0;border-color:#9fd4b8}
code{background:#eee;padding:.1rem .35rem;border-radius:4px}
</style></head><body>
  <h1>كيف تحصل على Access Token — بدون تعقيد</h1>
  <p>لا تحتاج تفهم <code>generateSecurityToken</code> أو API Testing Tool. اتبع الخطوات بالترتيب — السيرفر يستبدل الكود بتوكن تلقائياً.</p>

  <div class="step ok">
    <b>الخطوة 1 — Callback URL في AliExpress Console</b>
    <p>افتح <a href="https://openservice.aliexpress.com/app/list" target="_blank" rel="noopener">تطبيقات AliExpress</a> → App Settings → Callback URL وانسخ هذا الرابط <em>حرفياً</em>:</p>
    <pre id="cb">${escapeHtml(callbackUrl)}</pre>
    <button onclick="navigator.clipboard.writeText(document.getElementById('cb').textContent);this.textContent='تم النسخ ✅'">نسخ Callback URL</button>
    <p>App Key يجب أن يكون: <code>${escapeHtml(String(appKey))}</code></p>
    <ul style="margin:.5rem 0 0">
      <li>يبدأ بـ <code>https://</code> — بدون <code>/</code> في الآخر</li>
      <li>المسار: <code>/api/aliexpress/callback</code></li>
    </ul>
  </div>

  <div class="step">
    <b>الخطوة 2 — App Secret في Cloudflare</b>
    <p>من AliExpress Console → Advanced Information انسخ App Secret وأضفه في Cloudflare Worker Secrets باسم <code>ALIEXPRESS_APP_SECRET</code>.</p>
    <p style="color:#666;font-size:14px">تشخيص: configured=${status.configured}, envKey=${status.hasEnvAppKey}, envSecret=${status.hasEnvAppSecret}</p>
  </div>

  <div class="step ok">
    <b>الخطوة 3 — اضغط ربط OAuth (الأسهل)</b>
    <p>سجّل دخول AliExpress ووافق على التطبيق. إذا نجح الربط ستُعاد للداشبورد تلقائياً ✅</p>
    <a class="btn" href="/api/auth/aliexpress/connect">ربط OAuth الآن</a>
    <a class="btn" href="${workerOrigin}/dashboard" style="background:#444">الداشبورد</a>
  </div>

  <div class="step warn">
    <b>الخطوة 4 — إذا ظهر خطأ بعد الموافقة (بديل سهل)</b>
    <p>بعد الموافقة، AliExpress يعيد توجيهك لرابط فيه <code>?code=...</code>. انسخ قيمة <code>code</code> فقط (ليس access_token) والصقها في الداشبورد → الإعدادات → «استبدال الكود».</p>
    <p>مثال: <code style="direction:ltr;display:block;word-break:break-all">.../callback?code=<strong>هذا_الجزء_انسخه</strong>&amp;state=...</code></p>
    <a class="btn" href="${workerOrigin}/dashboard#tab-settings">افتح الإعدادات والصق الكود</a>
  </div>

  <div class="step">
    <b>ملاحظات</b>
    <ul>
      <li>الكود صالح لمرة واحدة فقط — إذا فشل، اضغط ربط OAuth من جديد</li>
      <li>لا تلصق <code>code</code> في حقل access_token — استخدم حقل «كود التفويض»</li>
      <li>انتظر 2–5 دقائق بعد تغيير Callback URL في Console</li>
    </ul>
  </div>

  <p><a href="/dashboard">← العودة للوحة التحكم</a></p>
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

/** استبدال authorization code يدوياً — للمستخدم اللي ما يعرف يوصل للتوكن */
aliexpressAuth.post("/aliexpress/exchange-code", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { code?: string };
  const rawCode = String(body.code ?? "").trim();

  // يقبل الرابط الكامل أو code فقط
  const code = extractAuthorizationCode(rawCode);
  if (!code || code.length < 4) {
    return c.json(
      {
        ok: false,
        error: "الصق كود التفويض (code) من رابط AliExpress بعد الموافقة — ليس access_token",
        hintAr:
          "بعد الموافقة على التطبيق، انسخ قيمة code من الرابط: .../callback?code=XXXX",
      },
      400,
    );
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

  const oauth = new AliExpressOAuth({
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    callbackUrl: creds.callbackUrl,
  });

  try {
    const token = await oauth.exchangeCodeForToken(code);
    await saveAliExpressTokens(c.env, {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
    });

    const check = await oauth.validateToken(token.accessToken, {
      expiresAt: token.expiresAt,
    });

    await auditOAuth(
      c.env,
      "aliexpress_oauth:manual_code_exchange",
      {
        expires_at: token.expiresAt,
        has_refresh_token: Boolean(token.refreshToken),
        valid: check.valid,
      },
      check.valid ? "success" : "partial",
      check.valid ? undefined : check.error ?? "Token saved but validation failed",
    );

    return c.json({
      ok: true,
      data: {
        saved: true,
        valid: check.valid,
        expiresAt: token.expiresAt,
        hasRefreshToken: Boolean(token.refreshToken),
        error: check.error ?? null,
        message_ar: check.valid
          ? "تم استبدال الكود وحفظ التوكن — APIs الرسمية جاهزة ✅"
          : `تم الحفظ لكن التحقق فشل: ${check.error ?? "جرّب OAuth من جديد"}`,
      },
    });
  } catch (err) {
    const message =
      err instanceof HttpError ? err.message : "تعذّر استبدال الكود";
    await auditOAuth(
      c.env,
      "aliexpress_oauth:manual_code_exchange",
      { code_length: code.length },
      "failed",
      message,
    );
    return c.json(
      {
        ok: false,
        error: message,
        hintAr:
          "الكود صالح لمرة واحدة — اضغط «ربط OAuth» من جديد واحصل على code جديد",
      },
      err instanceof HttpError ? err.status : 502,
    );
  }
});

/** حفظ Access Token يدوياً (خيار متقدم — من API Testing Tool) */
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

  let accessToken = creds.accessToken;
  let expiresAt = creds.tokenExpiresAt;
  let refreshed = false;

  let check = await oauth.validateToken(accessToken, { expiresAt });

  if (!check.valid && creds.refreshToken) {
    try {
      const next = await oauth.refreshAccessToken(creds.refreshToken);
      accessToken = next.accessToken;
      expiresAt = next.expiresAt;
      refreshed = true;
      await saveAliExpressTokens(c.env, {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
        expiresAt: next.expiresAt,
      });
      check = await oauth.validateToken(accessToken, { expiresAt });
    } catch {
      // keep original check result
    }
  }

  const signatureError = isAliExpressSignatureError(check.error ?? "");
  const tokenError = isAliExpressAuthError(check.error ?? "");

  return c.json({
    ok: check.valid,
    data: {
      valid: check.valid,
      refreshed,
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
      tokenPreview: accessToken.slice(0, 8) + "…",
      tokenLength: accessToken.length,
      expiresAt,
      hintAr: signatureError
        ? "توقيع DS API فشل — تأكد أن App Secret صحيح ثم أعد OAuth"
        : tokenError
          ? "App Secret صحيح — Access Token منتهي أو تالف. امسح التوكن واعمل OAuth من جديد"
          : check.valid
            ? refreshed
              ? "تم تجديد التوكن تلقائياً ✅"
              : null
            : check.error ?? "فشل التحقق",
    },
  });
});

/** مسح Access Token المحفوظ (لإعادة OAuth من الصفر) */
aliexpressAuth.delete("/aliexpress/token", requireAuth, async (c) => {
  const db = new SupabaseService(c.env);
  await db.clearAliExpressToken();
  return c.json({
    ok: true,
    data: {
      cleared: true,
      message_ar: "تم مسح التوكن — افتح ربط OAuth من جديد",
      connectUrl: "/api/auth/aliexpress/connect",
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
  const businessProbe = await oauth.probeBusinessSignature();
  const signatureOk = secretProbe.signatureOk && businessProbe.signatureOk;
  const probe = creds.accessToken
    ? await oauth.validateToken(creds.accessToken, { expiresAt: creds.tokenExpiresAt })
    : { valid: false, error: "no_token" };

  return c.json({
    ok: signatureOk && (probe.valid || !creds.accessToken),
    data: {
      ...status,
      signatureOk,
      businessSignatureOk: businessProbe.signatureOk,
      tokenValid: probe.valid,
      probeError:
        secretProbe.error ??
        businessProbe.error ??
        probe.error ??
        null,
      hintAr: !signatureOk
        ? "التوقيع فشل — App Secret لا يطابق AppKey 542618"
        : !creds.accessToken
          ? "App Secret صحيح ✅ — اعمل OAuth للحصول على Access Token"
          : probe.valid
            ? "كل شيء يعمل ✅"
            : "App Secret صحيح — Access Token تالف. امسحه واعمل OAuth من جديد",
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
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فشل ربط AliExpress</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;max-width:720px;line-height:1.7">
  <h1>فشل استبدال الكود تلقائياً</h1>
  <p>${escapeHtml(message)}</p>

  <div style="background:#fff8e6;border:1px solid #f0d78c;border-radius:10px;padding:1rem;margin:1.25rem 0">
    <h2 style="margin-top:0">لا تقلق — جرّب البديل السهل</h2>
    <p>انسخ <strong>كود التفويض</strong> من الأسفل والصقه في الداشبورد → الإعدادات → «استبدال الكود».</p>
    <p>لا تحتاج تبحث عن access_token — السيرفر يستبدله لك.</p>
    <label for="codeBox"><strong>كود التفويض (code):</strong></label>
    <pre id="codeBox" style="background:#f4f4f4;padding:.75rem;overflow:auto;direction:ltr;text-align:left;word-break:break-all">${escapeHtml(code)}</pre>
    <button onclick="navigator.clipboard.writeText(document.getElementById('codeBox').textContent);this.textContent='تم النسخ ✅'" style="padding:.5rem 1rem;cursor:pointer;margin-top:.5rem">نسخ الكود</button>
  </div>

  <p><a href="/dashboard#tab-settings" style="font-size:17px">← افتح الداشبورد والصق الكود</a></p>
  <p><a href="/api/auth/aliexpress/connect">أو أعد ربط OAuth من البداية</a></p>
  <p><a href="/api/auth/aliexpress/setup">دليل الإعداد الكامل</a></p>
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

/** يستخرج code من الرابط الكامل أو النص الملصوق */
export function extractAuthorizationCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get("code");
      if (fromQuery?.trim()) return fromQuery.trim();
    }
  } catch {
    // not a URL — fall through
  }

  const match = trimmed.match(/(?:^|[?&])code=([^&\s#]+)/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1].trim());
    } catch {
      return match[1].trim();
    }
  }

  return trimmed;
}

export { handleOAuthCallback as handleAliExpressOAuthCallback };
export default aliexpressAuth;
