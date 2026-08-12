import { Hono } from "hono";
import { AliExpressService } from "../services/aliexpress";
import { ImportPipeline } from "../services/pipeline";
import { PriceCompareService } from "../services/price-compare";
import { SheinService } from "../services/shein";
import { TemuService } from "../services/temu";
import type { Env, ImportProductInput, ProductSearchFilters, ProductStatus } from "../types";
import type { MarketplaceId } from "../types/marketplace";
import { requireAuth } from "../utils/session";
import { HttpError } from "../utils/http";

const products = new Hono<{ Bindings: Env }>();

products.get("/", requireAuth, async (c) => {
  const pipeline = new ImportPipeline(c.env);
  const status = c.req.query("status") as ProductStatus | undefined;
  const limit = Number(c.req.query("limit") ?? "50");
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  let rows = await pipeline.dbService.listProducts({
    status,
    limit: Math.max(limit, 100),
  });
  if (q) {
    rows = rows.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.aliexpress_id.includes(q) ||
        (p.shopify_handle ?? "").toLowerCase().includes(q),
    );
  }
  return c.json({ ok: true, data: rows.slice(0, limit) });
});

/** Keyword search on AliExpress / Temu / Shein */
products.post("/search", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ProductSearchFilters & {
    marketplace?: MarketplaceId;
  };

  const marketplace = body.marketplace ?? "aliexpress";

  try {
    if (marketplace === "temu") {
      const data = await new TemuService().search(body);
      return c.json({ ok: true, data: { ...data, results: data.results } });
    }
    if (marketplace === "shein") {
      const data = await new SheinService().search(body);
      return c.json({ ok: true, data: { ...data, results: data.results } });
    }

    const data = await new AliExpressService().search(body);
    return c.json({ ok: true, data });
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

/** Compare prices across AliExpress + Temu + Shein */
products.post("/compare", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ProductSearchFilters & {
    marketplaces?: MarketplaceId[];
  };

  try {
    const data = await new PriceCompareService().compare(body, body.marketplaces);
    return c.json({ ok: true, data });
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

products.post("/preview", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ImportProductInput;
  const pipeline = new ImportPipeline(c.env);
  try {
    const data = await pipeline.preview(body);
    return c.json({ ok: true, data });
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

products.post("/import", requireAuth, async (c) => {
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

products.get("/:aliexpressId", requireAuth, async (c) => {
  const aliexpressId = c.req.param("aliexpressId");
  if (!aliexpressId) {
    return c.json({ ok: false, error: "aliexpressId is required" }, 400);
  }

  const pipeline = new ImportPipeline(c.env);
  const row = await pipeline.dbService.getProductByAliExpressId(aliexpressId);
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  return c.json({ ok: true, data: row });
});

export default products;
