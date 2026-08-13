import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { renderDashboardPage } from "./dashboard/page";
import ai from "./routes/ai";
import aliexpressAuth, { handleAliExpressOAuthCallback } from "./routes/aliexpress-auth";
import auth from "./routes/auth";
import discover from "./routes/discover";
import favorites from "./routes/favorites";
import products from "./routes/products";
import sync from "./routes/sync";
import type { Env } from "./types";
import { HttpError } from "./utils/http";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
  }),
);

app.get("/", (c) => {
  const accept = c.req.header("Accept") ?? "";
  if (accept.includes("text/html")) {
    return c.redirect("/dashboard", 302);
  }
  return c.json({
    ok: true,
    service: "shixato-automation",
    environment: c.env.ENVIRONMENT ?? "unknown",
    dashboard: "/dashboard",
    endpoints: {
      health: "GET /health",
      login: "POST /api/auth/login",
      search: "POST /api/products/search",
      smartSearch: "POST /api/favorites/smart-search",
      autoDiscover: "POST /api/discover/auto",
      aiAnalyze: "POST /api/ai/analyze",
      favorites: "GET/POST /api/favorites",
      aliexpressConnect: "GET /api/auth/aliexpress/connect",
      aliexpressCallback: "GET /api/auth/aliexpress/callback",
      aliexpressCallbackAlias: "GET /api/aliexpress/callback",
      aliexpressStatus: "GET /api/auth/aliexpress/status",
      aliexpressSaveToken: "POST /api/auth/aliexpress/token",
      apiSearch: "POST /api/products/api-search",
      productProfile: "GET /api/products/profile/:id",
      freight: "POST /api/products/freight",
      preview: "POST /api/products/preview",
      import: "POST /api/products/import",
      list: "GET /api/products",
      logs: "GET /api/sync/logs",
    },
  });
});

app.get("/dashboard", (c) =>
  c.html(renderDashboardPage(c.env.SHOPIFY_STORE_DOMAIN || "shxato.myshopify.com")),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    status: "healthy",
    store: c.env.SHOPIFY_STORE_DOMAIN,
    timestamp: new Date().toISOString(),
  }),
);

app.route("/api/auth", auth);
app.route("/api/auth", aliexpressAuth);
app.get("/api/aliexpress/callback", (c) => handleAliExpressOAuthCallback(c));
app.route("/api/ai", ai);
app.route("/api/discover", discover);
app.route("/api/favorites", favorites);
app.route("/api/products", products);
app.route("/api/sync", sync);

app.notFound((c) => {
  const accept = c.req.header("Accept") ?? "";
  if (accept.includes("text/html")) {
    return c.redirect("/dashboard", 302);
  }
  return c.json({ ok: false, error: "Not found" }, 404);
});

app.onError((err, c) => {
  console.error(err);
  if (err instanceof HttpError) {
    return c.json(
      { ok: false, error: err.message, details: err.details ?? null },
      err.status as 400 | 401 | 500 | 502,
    );
  }
  return c.json({ ok: false, error: err.message || "Internal Server Error" }, 500);
});

export default app;
