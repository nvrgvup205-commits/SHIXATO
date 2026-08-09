import type { Context, Next } from "hono";
import type { Env } from "../types";

/** Bearer token gate for mutating endpoints */
export async function requireApiKey(c: Context<{ Bindings: Env }>, next: Next) {
  const expected = c.env.API_KEY;
  if (!expected) {
    return c.json({ ok: false, error: "API_KEY is not configured" }, 500);
  }

  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : (c.req.header("X-API-Key") ?? "").trim();

  if (!token || token !== expected) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  await next();
}
