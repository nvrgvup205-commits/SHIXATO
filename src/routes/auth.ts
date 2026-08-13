import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { saveAliExpressAppCredentials } from "../services/aliexpress-credentials";
import { SupabaseService } from "../services/supabase";
import type { Env } from "../types";
import { requireApiKey } from "../utils/auth";
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

/** Save AliExpress app credentials to Supabase (fallback when Cloudflare secrets fail) */
auth.post("/aliexpress/bootstrap", requireApiKey, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    appKey?: string;
    appSecret?: string;
  };
  const appKey = String(body.appKey ?? c.env.ALIEXPRESS_APP_KEY ?? "").trim();
  const appSecret = String(body.appSecret ?? "").trim();

  if (!appKey || !appSecret) {
    return c.json(
      { ok: false, error: "appKey و appSecret مطلوبان" },
      400,
    );
  }

  await saveAliExpressAppCredentials(c.env, { appKey, appSecret });
  return c.json({ ok: true, data: { saved: true } });
});

export default auth;
