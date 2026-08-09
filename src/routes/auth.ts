import { Hono } from "hono";
import type { Env } from "../types";
import {
  clearSessionCookie,
  getDashboardPin,
  issueSessionToken,
  requireAuth,
  setSessionCookie,
  verifySessionToken,
} from "../utils/session";
import { getCookie } from "hono/cookie";

const auth = new Hono<{ Bindings: Env }>();

/** PIN login for the dashboard (default pin: 1111 via DASHBOARD_PIN) */
auth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { pin?: string };
  const pin = String(body.pin ?? "").trim();
  const expected = getDashboardPin(c.env);

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
  return c.json({ ok: true, data: { authenticated: ok } });
});

/** Sanity check that session/API auth works */
auth.get("/ping", requireAuth, (c) => c.json({ ok: true, data: { pong: true } }));

export default auth;
