import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";

const COOKIE = "shixato_session";
const SESSION_DAYS = 14;

function encoder() {
  return new TextEncoder();
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder().encode(payload));
  return bufferToBase64Url(sig);
}

async function hmacVerify(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  const expected = await hmacSign(secret, payload);
  return timingSafeEqual(expected, signature);
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToText(value: string): string {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(b64);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function sessionSecret(env: Env): string {
  // Stable secret — not tied to API_KEY rotation; supports multiple concurrent logins.
  const parts = [
    env.SUPABASE_URL?.trim(),
    env.SHOPIFY_STORE_DOMAIN?.trim(),
    "shixato-dashboard-session-v2",
  ].filter(Boolean);
  return parts.join("|") || "shixato-dev-secret";
}

export function getEnvDashboardPin(env: Env): string {
  return (env.DASHBOARD_PIN || "1111").trim();
}

/** @deprecated use resolveDashboardPin — sync env fallback only */
export function getDashboardPin(env: Env): string {
  return getEnvDashboardPin(env);
}

/** Prefer PIN stored in Supabase; fall back to env DASHBOARD_PIN / 1111 */
export async function resolveDashboardPin(env: Env): Promise<string> {
  try {
    const { SupabaseService } = await import("../services/supabase");
    const db = new SupabaseService(env);
    const stored = await db.getSetting("dashboard_pin");
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // Supabase not configured / table missing
  }
  return getEnvDashboardPin(env);
}

export async function issueSessionToken(env: Env): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = textToBase64Url(JSON.stringify({ exp, v: 1 }));
  const sig = await hmacSign(sessionSecret(env), payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  env: Env,
  token: string | undefined | null,
): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!(await hmacVerify(sessionSecret(env), payload, sig))) return false;
  try {
    const data = JSON.parse(base64UrlToText(payload)) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function setSessionCookie(c: Context<{ Bindings: Env }>, token: string) {
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: Context<{ Bindings: Env }>) {
  deleteCookie(c, COOKIE, { path: "/" });
}

/** Accepts dashboard session cookie OR Bearer API_KEY (for scripts). */
export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const expectedKey = c.env.API_KEY;
  const header = c.req.header("Authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const xKey = (c.req.header("X-API-Key") ?? "").trim();
  const token = bearer || xKey;

  if (expectedKey && token && token === expectedKey) {
    await next();
    return;
  }

  const cookie = getCookie(c, COOKIE);
  if (await verifySessionToken(c.env, cookie)) {
    await next();
    return;
  }

  return c.json({ ok: false, error: "Unauthorized" }, 401);
}
