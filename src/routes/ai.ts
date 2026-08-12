import { Hono } from "hono";
import { WorkersAiService } from "../services/workers-ai";
import type { AliExpressListing, Env } from "../types";
import { requireAuth } from "../utils/session";
import { HttpError } from "../utils/http";

const ai = new Hono<{ Bindings: Env }>();

ai.post("/analyze", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    listing?: AliExpressListing;
    shipToCountry?: string;
    targetMarginPercent?: number;
  };

  const listing = body.listing;
  if (!listing?.aliexpressId || !listing.title) {
    return c.json({ ok: false, error: "listing مطلوب" }, 400);
  }

  try {
    const analysis = await new WorkersAiService(c.env).analyzeListing(listing, {
      shipToCountry: body.shipToCountry,
      targetMarginPercent: body.targetMarginPercent,
    });
    return c.json({
      ok: true,
      data: {
        ...analysis,
        aiEnabled: Boolean(c.env.AI),
      },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return c.json(
        { ok: false, error: err.message, details: err.details ?? null },
        err.status as 400 | 500 | 502,
      );
    }
    throw err;
  }
});

ai.get("/status", requireAuth, (c) => {
  return c.json({
    ok: true,
    data: {
      workersAi: Boolean(c.env.AI),
      model: "@cf/meta/llama-3.1-8b-instruct",
      hint: c.env.AI
        ? "Workers AI مفعّل"
        : "فعّل [ai] binding في wrangler.toml ثم أعد النشر",
    },
  });
});

export default ai;
