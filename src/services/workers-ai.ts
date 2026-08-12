import type { AiFilterResult, AliExpressListing, Env } from "../types";

export interface ProductAiAnalysis extends AiFilterResult {
  suggestedSellingPrice?: number;
  adCopyAr?: string;
  pros?: string[];
  cons?: string[];
  aiProvider: "workers-ai" | "heuristic";
}

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

export function hasArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Product analysis via Cloudflare Workers AI (with heuristic fallback).
 * Requires `[ai] binding = "AI"` in wrangler.toml.
 */
export class WorkersAiService {
  constructor(private env: Env) {}

  async analyzeListing(
    listing: AliExpressListing,
    context?: { shipToCountry?: string; targetMarginPercent?: number },
  ): Promise<ProductAiAnalysis> {
    if (this.env.AI) {
      try {
        return await this.analyzeWithWorkersAi(listing, context);
      } catch (err) {
        console.warn("Workers AI analyze failed, using heuristic", err);
      }
    }
    return this.analyzeHeuristic(listing, context);
  }

  /**
   * AliExpress search JSON often returns English titles even on ar.aliexpress.com.
   * Batch-translate listing titles to Arabic via Workers AI when needed.
   */
  async arabicTitles(listings: AliExpressListing[]): Promise<{
    listings: AliExpressListing[];
    translated: number;
    provider: "workers-ai" | "none";
  }> {
    const toTranslate = listings.filter((l) => l.title && !hasArabicText(l.title));
    if (!toTranslate.length) {
      return { listings, translated: 0, provider: "none" };
    }

    if (!this.env.AI) {
      return { listings, translated: 0, provider: "none" };
    }

    const titleMap = new Map<string, string>();
    const batchSize = 18;

    for (let i = 0; i < toTranslate.length; i += batchSize) {
      const batch = toTranslate.slice(i, i + batchSize);
      const chunkMap = await this.translateTitleBatch(batch);
      for (const [id, titleAr] of chunkMap) {
        titleMap.set(id, titleAr);
      }
    }

    let translated = 0;
    const out = listings.map((listing) => {
      const titleAr = titleMap.get(listing.aliexpressId);
      if (!titleAr || hasArabicText(listing.title)) return listing;
      translated += 1;
      return {
        ...listing,
        titleEn: listing.titleEn ?? listing.title,
        title: titleAr,
      };
    });

    return { listings: out, translated, provider: "workers-ai" };
  }

  private async translateTitleBatch(
    batch: AliExpressListing[],
  ): Promise<Map<string, string>> {
    const payload = batch.map((l) => ({
      id: l.aliexpressId,
      title: l.title.slice(0, 180),
    }));

    const prompt = `Translate AliExpress product titles to natural Arabic for Saudi e-commerce shoppers.
Keep brand names and model numbers (USB, RGB, 4K, iPhone, etc.) as-is.
Return JSON ONLY:
{"items":[{"id":"123","titleAr":"..."}]}

Titles:
${JSON.stringify(payload)}`;

    const result = await this.env.AI!.run(MODEL, {
      messages: [
        {
          role: "system",
          content: "You output strict JSON only. Translate product titles to Arabic.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200,
      temperature: 0.1,
    });

    const parsed = this.parseJsonFromText(this.extractAiText(result));
    const items = Array.isArray(parsed.items)
      ? (parsed.items as Array<Record<string, unknown>>)
      : [];

    const map = new Map<string, string>();
    for (const row of items) {
      const id = String(row.id ?? "");
      const titleAr = String(row.titleAr ?? row.title ?? "").trim();
      if (id && titleAr) map.set(id, titleAr);
    }
    return map;
  }

  private analyzeHeuristic(
    listing: AliExpressListing,
    context?: { shipToCountry?: string; targetMarginPercent?: number },
  ): ProductAiAnalysis {
    const margin = context?.targetMarginPercent ?? 40;
    const cost = listing.originalPrice || 0;
    const suggestedSellingPrice =
      cost > 0 ? Math.ceil((cost / (1 - margin / 100)) * 100) / 100 : undefined;

    let score = 50;
    const pros: string[] = [];
    const cons: string[] = [];

    if ((listing.soldCount ?? 0) >= 500) {
      score += 15;
      pros.push("مبيعات قوية");
    } else if ((listing.soldCount ?? 0) >= 100) {
      score += 6;
      pros.push("مبيعات معقولة");
    } else {
      cons.push("مبيعات محدودة");
    }

    if ((listing.rating ?? 0) >= 4.5) {
      score += 12;
      pros.push("تقييم ممتاز");
    } else if ((listing.rating ?? 0) >= 4.0) {
      score += 4;
    } else {
      cons.push("تقييم منخفض");
    }

    if (listing.isFreeShipping) pros.push("شحن مجاني");
    if (listing.isChoice) pros.push("AliExpress Choice");
    if (cost > 0 && cost < 30) pros.push("سعر شراء مناسب للدروب شيبنج");
    if (cost <= 0) {
      score -= 20;
      cons.push("السعر غير واضح");
    }

    score = Math.max(0, Math.min(100, score));
    const approved = score >= 55;

    return {
      approved,
      score: Math.round(score),
      reason: approved
        ? "منتج مناسب للتجربة حسب البيانات المتاحة"
        : "يحتاج مراجعة إضافية قبل الإعلان",
      suggestedTitle: listing.title,
      suggestedSellingPrice,
      adCopyAr: listing.title
        ? `🔥 ${listing.title} — اطلبه الآن مع شحن سريع إلى ${context?.shipToCountry ?? "السعودية"}!`
        : undefined,
      pros,
      cons,
      tags: ["heuristic"],
      aiProvider: "heuristic",
    };
  }

  private async analyzeWithWorkersAi(
    listing: AliExpressListing,
    context?: { shipToCountry?: string; targetMarginPercent?: number },
  ): Promise<ProductAiAnalysis> {
    const shipTo = context?.shipToCountry ?? "SA";
    const margin = context?.targetMarginPercent ?? 40;

    const prompt = `أنت خبير دروب شيبنج للسوق العربي (${shipTo}).
حلّل منتج AliExpress التالي وأرجع JSON فقط بهذا الشكل:
{"approved":boolean,"score":number,"reason":string,"suggestedTitle":string,"suggestedSellingPrice":number,"adCopyAr":string,"pros":string[],"cons":string[],"tags":string[]}

القواعد:
- approved=true إذا المنتج قابل للبيع في متجر عربي (ليس مقلد/سلاح/بالغ)
- score من 0 إلى 100
- suggestedTitle بالعربية الفصحى البسيطة
- suggestedSellingPrice بالدولار مع هامش ربح ~${margin}%
- adCopyAr: جملة إعلان قصيرة بالعربي لـ TikTok/Snapchat

المنتج:
العنوان: ${listing.title}
السعر: ${listing.originalPrice} ${listing.currency}
المبيعات: ${listing.soldCount ?? "غير معروف"}
التقييم: ${listing.rating ?? "غير معروف"}
عدد التقييمات: ${listing.reviewCount ?? "غير معروف"}
شحن مجاني: ${listing.isFreeShipping ? "نعم" : "لا"}
Choice: ${listing.isChoice ? "نعم" : "لا"}`;

    const result = await this.env.AI!.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You are a JSON-only assistant for Arabic dropshipping product analysis.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 700,
      temperature: 0.2,
    });

    const text = this.extractAiText(result);
    const parsed = this.parseJsonFromText(text);

    return {
      approved: Boolean(parsed.approved),
      score: Math.round(Number(parsed.score) || 0),
      reason: String(parsed.reason || "تحليل Workers AI"),
      suggestedTitle: String(parsed.suggestedTitle || listing.title),
      suggestedSellingPrice: Number(parsed.suggestedSellingPrice) || undefined,
      adCopyAr: String(parsed.adCopyAr || ""),
      pros: Array.isArray(parsed.pros) ? parsed.pros.map(String) : [],
      cons: Array.isArray(parsed.cons) ? parsed.cons.map(String) : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : ["workers-ai"],
      aiProvider: "workers-ai",
    };
  }

  private extractAiText(result: unknown): string {
    if (!result || typeof result !== "object") return "";
    const r = result as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
    if (typeof r.result === "string") return r.result;
    const choices = r.choices as Array<{ message?: { content?: string } }> | undefined;
    if (choices?.[0]?.message?.content) return choices[0].message.content;
    return JSON.stringify(result);
  }

  private parseJsonFromText(text: string): Record<string, unknown> {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in AI response");
      return JSON.parse(match[0]!) as Record<string, unknown>;
    }
  }
}
