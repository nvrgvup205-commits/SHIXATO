import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { SupabaseService } from "../services/supabase";
import type { Env } from "../types";
import {
  clearSessionCookie,
  issueSessionToken,
  requireAuth,
  resolveDashboardPin,
  setSessionCookie,
  verifySessionToken,
} from "../utils/session";
import { HttpError } from "../utils/http";

const auth = new Hono<{ Bindings: Env }>();

/** PIN login for the dashboard (default pin: 1111) */
auth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { pin?: string };
  const pin = String(body.pin ?? "").trim();
  const expected = await resolveDashboardPin(c.env);

  if (!pin || pin !== expected) {
    return c.json({ ok: false, error: "الرقم السري غير صحيح" }, 401);
  }

  const token = await issueSessionToken(c.env);
  setSessionCookie(c, token);
  return c.json({ ok: true, data: { authenticated: true } });
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

export default auth;
