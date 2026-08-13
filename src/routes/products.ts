import { Hono } from "hono";
import { requireAliExpressToken } from "../middleware/aliexpress-auth";
import { AliExpressApi } from "../services/aliexpress-api";
import { hybridAliExpressSearch } from "../services/hybrid-search";
import { hasAliExpressAccessToken, loadAliExpressCredentials } from "../services/aliexpress-credentials";
import { AliExpressService } from "../services/aliexpress";
import { ImportPipeline } from "../services/pipeline";
import type { Env, ImportProductInput, ProductSearchFilters, ProductStatus } from "../types";
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

/**
 * بحث AliExpress — scraping (الافتراضي، يعمل بدون token).
 * يُكمّل بالـ API الرسمي تلقائياً عند فتح المنتج إن وُجد token.
 */
products.post("/search", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ProductSearchFilters;
  try {
    const data = await hybridAliExpressSearch(c.env, body);
    const hasToken = await hasAliExpressAccessToken(c.env);
    return c.json({
      ok: true,
      data: {
        ...data,
        meta: {
          source: hasToken ? "hybrid" : "scraping",
          apiEnrichmentAvailable: hasToken,
          apiMerged: data.apiMerged ?? 0,
        },
      },
    });
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

/** بحث عبر API الرسمي (يحتاج access token) */
products.post("/api-search", requireAuth, requireAliExpressToken(), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    keyword?: string;
    page?: number;
  };
  const keyword = String(body.keyword ?? "").trim();
  const page = Math.max(1, Number(body.page ?? 1));

  if (keyword.length < 2) {
    return c.json({ ok: false, error: "keyword مطلوب (حرفين على الأقل)" }, 400);
  }

  try {
    const api = await AliExpressApi.fromEnv(c.env);
    const results = await api.searchProducts(keyword, page);
    return c.json({
      ok: true,
      data: { results, keyword, page, source: "aliexpress_ds_api" },
    });
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

/** ملف المنتج الكامل من API الرسمي (تفاصيل + شحن + ربح) */
products.get("/profile/:productId", requireAuth, requireAliExpressToken(), async (c) => {
  const productId = c.req.param("productId").trim();
  if (!productId) {
    return c.json({ ok: false, error: "productId مطلوب" }, 400);
  }

  try {
    const api = await AliExpressApi.fromEnv(c.env);
    const [details, shipping] = await Promise.all([
      api.getProductDetails(productId),
      api.getShippingCost(productId, 1).catch(() => null),
    ]);

    return c.json({
      ok: true,
      data: {
        ...details,
        shipping,
        shippingToSaudi: shipping
          ? {
              serviceName: shipping.service_name,
              amount: shipping.cost,
              currency: shipping.currency,
              estimatedDeliveryDays: shipping.estimated_delivery_days,
            }
          : null,
      },
      meta: { source: "aliexpress_ds_api" },
    });
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

/** تكلفة الشحن للسعودية عبر API الرسمي */
products.post("/freight", requireAuth, requireAliExpressToken(), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    productId?: string;
    aliexpressId?: string;
    quantity?: number;
  };

  const productId = String(body.productId ?? body.aliexpressId ?? "").trim();
  if (!productId) {
    return c.json({ ok: false, error: "productId مطلوب" }, 400);
  }

  try {
    const api = await AliExpressApi.fromEnv(c.env);
    const shipping = await api.getShippingCost(productId, body.quantity ?? 1);
    return c.json({ ok: true, data: shipping });
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
