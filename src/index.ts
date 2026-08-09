import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import products from "./routes/products";
import sync from "./routes/sync";
import type { Env } from "./types";
import { HttpError } from "./utils/http";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  }),
);

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "shixato-automation",
    environment: c.env.ENVIRONMENT ?? "unknown",
    endpoints: {
      health: "GET /health",
      preview: "POST /api/products/preview",
      import: "POST /api/products/import",
      list: "GET /api/products",
      logs: "GET /api/sync/logs",
    },
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    status: "healthy",
    store: c.env.SHOPIFY_STORE_DOMAIN,
    timestamp: new Date().toISOString(),
  }),
);

app.route("/api/products", products);
app.route("/api/sync", sync);

app.notFound((c) => c.json({ ok: false, error: "Not found" }, 404));

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
