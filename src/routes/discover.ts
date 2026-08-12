import { Hono } from "hono";
import { listCategoriesWithKeywords } from "../data/trending-keywords";
import { AutoDiscoverService } from "../services/auto-discover";
import type { Env } from "../types";
import { requireAuth } from "../utils/session";
import { HttpError } from "../utils/http";

const discover = new Hono<{ Bindings: Env }>();

discover.get("/keywords", requireAuth, (c) => {
  return c.json({
    ok: true,
    data: {
      categoriesWithKeywords: listCategoriesWithKeywords(),
      hint: "الكلمات تُولَّد تلقائيًا ب Workers AI عند كل اكتشاف (استدعاء واحد خفيف)",
    },
  });
});

/**
 * اكتشاف تلقائي مبهر — يبحث في عشرات الكلمات، يدمج، يفلتر، يعرض الأفضل فقط.
 */
discover.post("/auto", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    category?: string;
    shipToCountry?: string;
    currency?: string;
    keywordLimit?: number;
    minWow?: number;
    minScore?: number;
    maxResults?: number;
  };

  if (!body.category?.trim()) {
    return c.json({ ok: false, error: "اختر الفئة أولًا" }, 400);
  }

  try {
    const data = await new AutoDiscoverService().discover({
      category: body.category,
      shipToCountry: body.shipToCountry,
      currency: body.currency,
      keywordLimit: body.keywordLimit,
      minWow: body.minWow ?? body.minScore,
      maxResults: body.maxResults,
      env: c.env,
    });

    return c.json({ ok: true, data });
  } catch (err) {
    if (err instanceof HttpError) {
      return c.json(
        { ok: false, error: err.message, details: err.details ?? null },
        err.status as 400 | 429 | 500 | 502,
      );
    }
    throw err;
  }
});

export default discover;
