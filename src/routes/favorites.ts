import { Hono } from "hono";
import { DROPSHIP_PRESETS, buildPresetSearch, type DropshipGrade } from "../data/dropship-presets";
import { ImportPipeline } from "../services/pipeline";
import { hasArabicText } from "../services/workers-ai";
import type { AliExpressListing, Env, ImportProductInput } from "../types";
import { requireAuth } from "../utils/session";
import { HttpError } from "../utils/http";

type FavoriteAiPayload = {
  suggestedTitle?: string;
  hookAr?: string;
  adCopyAr?: string;
  descriptionAr?: string;
  pros?: string[];
  score?: number;
  suggestedSellingPrice?: number;
};

function resolveFavoriteAi(
  listing: AliExpressListing,
  ai?: FavoriteAiPayload,
): FavoriteAiPayload | null {
  if (ai?.suggestedTitle?.trim()) return ai;

  const stored = (listing as AliExpressListing & { aiAnalyzed?: FavoriteAiPayload })
    .aiAnalyzed;
  if (stored?.suggestedTitle?.trim()) return stored;

  if (
    hasArabicText(listing.title) &&
    (listing.hookAr?.trim() || listing.descriptionAr?.trim())
  ) {
    return {
      suggestedTitle: listing.title.trim(),
      hookAr: listing.hookAr,
      adCopyAr: listing.adCopyAr,
      descriptionAr: listing.descriptionAr,
      pros: listing.pros,
      score: listing.aiScore,
      suggestedSellingPrice: listing.sellingPrice,
    };
  }

  return null;
}

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
    category?: string;
    query?: string;
    shipToCountry?: string;
    currency?: string;
  };

  const grade = body.grade;
  if (!grade || !["starter", "balanced", "pro"].includes(grade)) {
    return c.json({ ok: false, error: "grade مطلوب: starter | balanced | pro" }, 400);
  }

  const hasCategory = Boolean(body.category?.trim());
  const hasQuery = Boolean(body.query?.trim() && body.query.trim().length >= 2);
  if (!hasCategory && !hasQuery) {
    return c.json(
      {
        ok: false,
        error: "اختر الفئة أولًا ثم اضغط مبتدئ / متوسط / محترف",
      },
      400,
    );
  }

  try {
    const filters = buildPresetSearch(grade, {
      category: body.category,
      query: body.query,
      shipToCountry: body.shipToCountry,
      currency: body.currency,
    });
    const { hybridAliExpressSearch } = await import("../services/hybrid-search");
    const data = await hybridAliExpressSearch(c.env, filters);
    return c.json({
      ok: true,
      data: {
        ...data,
        presetGrade: grade,
        presetLabelAr: DROPSHIP_PRESETS.find((p) => p.id === grade)?.labelAr,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "CATEGORY_REQUIRED") {
      return c.json(
        { ok: false, error: "اختر الفئة أولًا ثم اضغط مبتدئ / متوسط / محترف" },
        400,
      );
    }
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
    aiAnalysis?: FavoriteAiPayload;
  };

  const listing = body.listing;
  if (!listing?.aliexpressId || !listing.title) {
    return c.json({ ok: false, error: "listing مع aliexpressId و title مطلوب" }, 400);
  }

  const ai = resolveFavoriteAi(listing, body.aiAnalysis);
  if (!ai?.suggestedTitle?.trim()) {
    return c.json(
      {
        ok: false,
        error: "اضغط 🤖 حلّل بالذكاء الاصطناعي أولًا — بعدها يتفعّل زر المفضلة",
      },
      400,
    );
  }

  const enriched: AliExpressListing = {
    ...listing,
    titleEn: listing.titleEn ?? listing.title,
    title: ai.suggestedTitle.trim(),
    hookAr: ai.hookAr?.trim() || undefined,
    adCopyAr: ai.adCopyAr?.trim() || undefined,
    descriptionAr: ai.descriptionAr?.trim() || undefined,
    pros: ai.pros?.length ? ai.pros : listing.pros,
    aiScore: ai.score,
    sellingPrice: ai.suggestedSellingPrice ?? listing.sellingPrice,
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

favorites.patch("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: "id مطلوب" }, 400);

  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    hookAr?: string;
    adCopyAr?: string;
    descriptionAr?: string;
    sellingPrice?: number;
    notes?: string | null;
  };

  const pipeline = new ImportPipeline(c.env);
  const fav = await pipeline.dbService.getFavorite(id);
  if (!fav) return c.json({ ok: false, error: "Not found" }, 404);

  const listing = { ...(fav.listing as AliExpressListing) };
  if (body.hookAr !== undefined) listing.hookAr = body.hookAr.trim() || undefined;
  if (body.adCopyAr !== undefined) listing.adCopyAr = body.adCopyAr.trim() || undefined;
  if (body.descriptionAr !== undefined) {
    listing.descriptionAr = body.descriptionAr.trim() || undefined;
  }
  if (body.sellingPrice !== undefined) {
    listing.sellingPrice =
      Number.isFinite(body.sellingPrice) && body.sellingPrice > 0
        ? body.sellingPrice
        : undefined;
  }

  const title = body.title?.trim() || fav.title;
  listing.title = title;

  const row = await pipeline.dbService.updateFavorite(id, {
    title,
    notes: body.notes !== undefined ? body.notes : fav.notes,
    listing: listing as unknown as Record<string, unknown>,
  });

  return c.json({ ok: true, data: row });
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

  const listing = fav.listing as AliExpressListing;
  const sellingPrice =
    body.sellingPrice ??
    (Number.isFinite(listing.sellingPrice) && listing.sellingPrice! > 0
      ? listing.sellingPrice
      : undefined);

  try {
    const result = await pipeline.importProduct({
      aliexpressId: fav.aliexpress_id,
      listing,
      force: body.force ?? true,
      sellingPrice,
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
