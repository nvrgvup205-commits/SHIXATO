import { Hono } from "hono";
import { ImportPipeline } from "../services/pipeline";
import type { Env, ImportProductInput, ProductStatus } from "../types";
import { requireApiKey } from "../utils/auth";
import { HttpError } from "../utils/http";

const products = new Hono<{ Bindings: Env }>();

products.get("/", requireApiKey, async (c) => {
  const pipeline = new ImportPipeline(c.env);
  const status = c.req.query("status") as ProductStatus | undefined;
  const limit = Number(c.req.query("limit") ?? "50");
  const rows = await pipeline.dbService.listProducts({ status, limit });
  return c.json({ ok: true, data: rows });
});

products.get("/:aliexpressId", requireApiKey, async (c) => {
  const aliexpressId = c.req.param("aliexpressId");
  if (!aliexpressId) {
    return c.json({ ok: false, error: "aliexpressId is required" }, 400);
  }

  const pipeline = new ImportPipeline(c.env);
  const row = await pipeline.dbService.getProductByAliExpressId(aliexpressId);
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  return c.json({ ok: true, data: row });
});

/** Scrape only — no DB / Shopify side effects */
products.post("/preview", requireApiKey, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ImportProductInput;
  const pipeline = new ImportPipeline(c.env);
  const data = await pipeline.preview(body);
  return c.json({ ok: true, data });
});

/** Full pipeline: scrape → AI filter → Supabase → Shopify */
products.post("/import", requireApiKey, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ImportProductInput;
  const pipeline = new ImportPipeline(c.env);

  try {
    const result = await pipeline.importProduct(body);
    return c.json({ ok: true, data: result }, result.synced ? 201 : 200);
  } catch (err) {
    if (err instanceof HttpError) {
      return c.json(
        { ok: false, error: err.message, details: err.details ?? null },
        err.status as 400 | 401 | 500 | 502,
      );
    }
    throw err;
  }
});

export default products;
