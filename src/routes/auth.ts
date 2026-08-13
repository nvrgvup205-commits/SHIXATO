import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { AliExpressApiClient } from "../services/aliexpress-api";
import {
  hasAliExpressAppCredentials,
  loadAliExpressCredentials,
  resolveAliExpressCallbackUrl,
  saveAliExpressTokens,
} from "../services/aliexpress-credentials";
import { SupabaseService } from "../services/supabase";
import type { Env } from "../types";
import {
  clearSessionCookie,
  isValidDashboardPin,
  issueSessionToken,
  requireAuth,
  resolveDashboardPin,
  setSessionCookie,
  verifySessionToken,
  getEnvDashboardPin,
} from "../utils/session";
import { HttpError } from "../utils/http";

const auth = new Hono<{ Bindings: Env }>();

/** PIN login for the dashboard (default pin: 1111) */
auth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { pin?: string };
  const pin = String(body.pin ?? "").trim();

  if (!(await isValidDashboardPin(c.env, pin))) {
    const hint =
      getEnvDashboardPin(c.env) === "1111"
        ? "الرقم غير صحيح — جرّب 1111 أو الرقم الذي ضبطته في الإعدادات"
        : "الرقم غير صحيح — راجع DASHBOARD_PIN في Cloudflare أو الإعدادات";
    return c.json({ ok: false, error: hint }, 401);
  }

  const token = await issueSessionToken(c.env);
  setSessionCookie(c, token);
  return c.json({ ok: true, data: { authenticated: true } });
});

/** Public hint for login troubleshooting (does not reveal the PIN) */
auth.get("/hint", async (c) => {
  const envPin = getEnvDashboardPin(c.env);
  let pinSource: "supabase" | "env" = "env";
  let supabaseReachable = false;
  try {
    const db = new SupabaseService(c.env);
    const stored = await db.getSetting("dashboard_pin");
    supabaseReachable = true;
    if (stored?.trim()) pinSource = "supabase";
  } catch {
    supabaseReachable = false;
  }

  return c.json({
    ok: true,
    data: {
      pinSource,
      supabaseReachable,
      envPinIsDefault: envPin === "1111",
      multiSession: true,
      hint:
        pinSource === "supabase"
          ? "الرقم في Supabase — جرّب 1111 أيضًا إن لم تغيّره، أو الرقم من الإعدادات"
          : envPin === "1111"
            ? "الافتراضي: 1111"
            : "الرقم من متغير DASHBOARD_PIN في Cloudflare",
    },
  });
});

auth.post("/logout", async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const cookie = getCookie(c, "shixato_session");
  const ok = await verifySessionToken(c.env, cookie);
  let pinSource: "supabase" | "env" = "env";
  try {
    const db = new SupabaseService(c.env);
    const stored = await db.getSetting("dashboard_pin");
    if (stored?.trim()) pinSource = "supabase";
  } catch {
    // Supabase unavailable — env PIN still works
  }
  return c.json({
    ok: true,
    data: {
      authenticated: ok,
      pinSource,
      multiSession: true,
    },
  });
});

/** Change dashboard PIN (stored in Supabase shixato.app_settings) */
auth.post("/change-pin", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    currentPin?: string;
    newPin?: string;
  };
  const currentPin = String(body.currentPin ?? "").trim();
  const newPin = String(body.newPin ?? "").trim();

  if (!/^\d{4,12}$/.test(newPin)) {
    return c.json(
      { ok: false, error: "الرقم الجديد يجب أن يكون من 4 إلى 12 رقمًا" },
      400,
    );
  }

  const expected = await resolveDashboardPin(c.env);
  if (!currentPin || currentPin !== expected) {
    return c.json({ ok: false, error: "الرقم السري الحالي غير صحيح" }, 401);
  }

  try {
    const db = new SupabaseService(c.env);
    await db.setSetting("dashboard_pin", newPin);
  } catch (err) {
    if (err instanceof HttpError) {
      return c.json(
        {
          ok: false,
          error:
            "تعذّر حفظ الرقم — نفّذ migration جدول app_settings في Supabase أولًا",
          details: err.details ?? null,
        },
        500,
      );
    }
    throw err;
  }

  // Refresh session after PIN change
  const token = await issueSessionToken(c.env);
  setSessionCookie(c, token);

  return c.json({ ok: true, data: { updated: true } });
});

auth.get("/ping", requireAuth, (c) => c.json({ ok: true, data: { pong: true } }));

/** AliExpress OAuth — start authorization */
auth.get("/aliexpress/connect", async (c) => {
  if (!hasAliExpressAppCredentials(c.env)) {
    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem">
        <h1>AliExpress غير مضبوط</h1>
        <p>أضف <code>ALIEXPRESS_APP_KEY</code> و <code>ALIEXPRESS_APP_SECRET</code> في Cloudflare Secrets.</p>
      </body></html>`,
      500,
    );
  }

  const creds = await loadAliExpressCredentials(c.env);
  if (!creds) {
    return c.json({ ok: false, error: "AliExpress credentials missing" }, 500);
  }

  const client = new AliExpressApiClient(creds);
  return c.redirect(client.buildAuthorizeUrl("shixato"), 302);
});

/** AliExpress OAuth callback — exchange code for access token */
auth.get("/aliexpress/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");
  const errorDescription = c.req.query("error_description");

  if (error) {
    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem">
        <h1>فشل ربط AliExpress</h1>
        <p>${errorDescription || error}</p>
        <p><a href="/dashboard">العودة للوحة التحكم</a></p>
      </body></html>`,
      400,
    );
  }

  if (!code) {
    return c.json({ ok: false, error: "Missing authorization code" }, 400);
  }

  const creds = await loadAliExpressCredentials(c.env);
  if (!creds) {
    return c.json({ ok: false, error: "AliExpress credentials missing" }, 500);
  }

  try {
    const client = new AliExpressApiClient(creds);
    const token = await client.createTokenFromCode(code);
    const accessToken = token.access_token?.trim();
    if (!accessToken) {
      throw new HttpError(502, "AliExpress لم يرجع access token", token);
    }

    const expiresAt =
      token.expire_time != null
        ? new Date(Number(token.expire_time)).toISOString()
        : token.expires_in != null
          ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
          : null;

    await saveAliExpressTokens(c.env, {
      accessToken,
      refreshToken: token.refresh_token ?? null,
      expiresAt,
    });

    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem;max-width:640px">
        <h1>تم ربط AliExpress بنجاح</h1>
        <p>تم حفظ Access Token في SHIXATO. يمكنك الآن استخدام APIs الرسمية (منتجات، شحن، طلبات).</p>
        <p><strong>ينتهي تقريباً:</strong> ${expiresAt ?? "غير معروف"}</p>
        <p><a href="/dashboard">العودة للوحة التحكم</a></p>
      </body></html>`,
    );
  } catch (err) {
    const message =
      err instanceof HttpError ? err.message : "تعذّر استبدال كود التفعيل";
    return c.html(
      `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:2rem">
        <h1>فشل ربط AliExpress</h1>
        <p>${message}</p>
        <p><a href="/api/auth/aliexpress/connect">إعادة المحاولة</a></p>
      </body></html>`,
      502,
    );
  }
});

/** AliExpress connection status for dashboard troubleshooting */
auth.get("/aliexpress/status", requireAuth, async (c) => {
  const configured = hasAliExpressAppCredentials(c.env);
  const creds = configured ? await loadAliExpressCredentials(c.env) : null;
  return c.json({
    ok: true,
    data: {
      configured,
      callbackUrl: resolveAliExpressCallbackUrl(c.env),
      hasAccessToken: Boolean(creds?.accessToken),
      tokenExpiresAt: creds?.tokenExpiresAt ?? null,
      connectUrl: "/api/auth/aliexpress/connect",
      appKey: creds?.appKey ?? null,
    },
  });
});

export default auth;
