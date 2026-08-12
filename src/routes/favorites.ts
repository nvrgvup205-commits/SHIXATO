import { Hono } from "hono";
import { DROPSHIP_PRESETS, buildPresetSearch, type DropshipGrade } from "../data/dropship-presets";
import { ImportPipeline } from "../services/pipeline";
import type { Env, ImportProductInput } from "../types";
import { requireAuth } from "../utils/session";
import { HttpError } from "../utils/http";

const favorites = new Hono<{ Bindings: Env }>();

favorites.get("/presets", requireAuth, (c) => {
  return c.json({
    ok: true,
    data: DROPSHIP_PRESETS.map((p) => ({
      id: p.id,
      labelAr: p.labelAr,
      emoji: p.emoji,
      descAr: p.descAr,
      tipAr: p.tipAr,
    })),
  });
});

favorites.post("/smart-search", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    grade?: DropshipGrade;
    shipToCountry?: string;
    currency?: string;
  };

  const grade = body.grade;
  if (!grade || !["starter", "balanced", "pro"].includes(grade)) {
    return c.json({ ok: false, error: "grade مطلوب: starter | balanced | pro" }, 400);
  }

  try {
    const filters = buildPresetSearch(grade, {
      shipToCountry: body.shipToCountry,
      currency: body.currency,
    });
    const { AliExpressService } = await import("../services/aliexpress");
    const data = await new AliExpressService().search(filters);
    return c.json({
      ok: true,
      data: {
        ...data,
        presetGrade: grade,
        presetLabelAr: DROPSHIP_PRESETS.find((p) => p.id === grade)?.labelAr,
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

favorites.get("/", requireAuth, async (c) => {
  const pipeline = new ImportPipeline(c.env);
  const limit = Number(c.req.query("limit") ?? "100");
  const data = await pipeline.dbService.listFavorites(limit);
  return c.json({ ok: true, data });
});

favorites.post("/", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    listing?: ImportProductInput["listing"];
    notes?: string;
    presetGrade?: string;
    aiAnalysis?: {
      suggestedTitle?: string;
      hookAr?: string;
      adCopyAr?: string;
      score?: number;
    };
  };

  const listing = body.listing;
  if (!listing?.aliexpressId || !listing.title) {
    return c.json({ ok: false, error: "listing مع aliexpressId و title مطلوب" }, 400);
  }

  const ai = body.aiAnalysis;
  if (!ai?.suggestedTitle?.trim()) {
    return c.json(
      {
        ok: false,
        error: "حلّل بالذكاء الاصطناعي أولًا — الترجمة السعودية تُحفظ مع المفضلة فقط",
      },
      400,
    );
  }

  const enriched = {
    ...listing,
    titleEn: listing.titleEn ?? listing.title,
    title: ai.suggestedTitle.trim(),
    hookAr: ai.hookAr?.trim() || undefined,
    adCopyAr: ai.adCopyAr?.trim() || undefined,
    aiScore: ai.score,
  };

  const pipeline = new ImportPipeline(c.env);
  const row = await pipeline.dbService.upsertFavorite({
    aliexpress_id: enriched.aliexpressId,
    title: enriched.title,
    original_price: enriched.originalPrice ?? 0,
    currency: enriched.currency ?? "USD",
    listing: enriched as unknown as Record<string, unknown>,
    notes: body.notes ?? ai.adCopyAr ?? ai.hookAr ?? null,
    preset_grade: body.presetGrade ?? null,
  });

  return c.json({ ok: true, data: row }, 201);
});

favorites.delete("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: "id مطلوب" }, 400);
  const pipeline = new ImportPipeline(c.env);
  await pipeline.dbService.deleteFavorite(id);
  return c.json({ ok: true });
});

favorites.post("/:id/import", requireAuth, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: "id مطلوب" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as {
    sellingPrice?: number;
    force?: boolean;
  };

  const pipeline = new ImportPipeline(c.env);
  const fav = await pipeline.dbService.getFavorite(id);
  if (!fav) return c.json({ ok: false, error: "Not found" }, 404);

  const listing = fav.listing as ImportProductInput["listing"];
  try {
    const result = await pipeline.importProduct({
      aliexpressId: fav.aliexpress_id,
      listing,
      force: body.force ?? true,
      sellingPrice: body.sellingPrice,
    });
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

export default favorites;
