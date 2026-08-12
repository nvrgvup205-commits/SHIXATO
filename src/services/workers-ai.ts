import type { AiFilterResult, AliExpressListing, Env } from "../types";
import {
  buildArabicDescriptionHtml,
  normalizeHookAr,
} from "../utils/arabic-product";

export interface ProductAiAnalysis extends AiFilterResult {
  suggestedSellingPrice?: number;
  /** Short Saudi-dialect marketing hook (scroll-stopper) */
  hookAr?: string;
  adCopyAr?: string;
  descriptionAr?: string;
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
    const shortName = listing.title.split(/[,\-–|]/)[0]?.trim() || listing.title;
    const hookAr = normalizeHookAr("تعبت من الفوضى؟ هالقطعة تحلها لك بثواني");
    const adCopyAr = `تخيل ترتّب يومك بدون تعب 😍 ${shortName} — جرّبها الحين ولا تندم.`;
    const prosAr = pros.length ? pros : ["سهل الاستخدام", "سعر مناسب", "طلب سريع"];

    return {
      approved,
      score: Math.round(score),
      reason: approved
        ? "منتج مناسب للتجربة حسب البيانات المتاحة"
        : "يحتاج مراجعة إضافية قبل الإعلان",
      suggestedTitle: `${shortName} — حل سريع لمشكلة يومية`,
      hookAr,
      suggestedSellingPrice,
      adCopyAr,
      descriptionAr: buildArabicDescriptionHtml({
        hookAr,
        adCopyAr,
        pros: prosAr,
        title: shortName,
      }),
      pros: prosAr,
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

    const prompt = `أنت كاتب إعلانات سعودي حقيقي (TikTok/Snap) للسوق السعودي (${shipTo}).
حلّل منتج AliExpress وأرجع JSON فقط:
{"approved":boolean,"score":number,"reason":string,"suggestedTitle":string,"hookAr":string,"suggestedSellingPrice":number,"adCopyAr":string,"descriptionAr":string,"pros":string[],"cons":string[],"tags":string[]}

قواعد الهوك hookAr (الأهم):
- جملة واحدة قصيرة جدًا (6–12 كلمة) بلهجة سعودية بشرية 100%
- تبدأ بمشكلة يومية يعاني منها العميل ثم تلمّح للحل (مثل: تعبك من …؟ / ليش تتعذب مع …؟ / ترا فيه حل بسيط لـ …)
- كأنك تكلم صديق — مو إعلان رسمي ولا فصحى ثقيلة
- ممنوع: جمل طويلة، مبالغة مزيفة، كلمات تسويقية فاضية

قواعد باقي النصوص:
- suggestedTitle: عنوان متجر عربي سعودي واضح (بدون إيموجي كثير)
- adCopyAr: جملتين كحد أقصى بلهجة سعودية طبيعية
- descriptionAr: وصف منتج كامل للمتجر بالعربي (فقرتين + 3-5 نقاط مميزات) بصيغة HTML بسيطة فقط: <p> و <ul><li>
- استخدم: "الحين"، "مرة"، "تعبك"، "حلها"، "بسيط" — احتفظ بالماركات بالإنجليزي (USB, iPhone…)

قواعد التحليل:
- approved=true إذا المنتج قابل للبيع (ليس مقلد/سلاح/بالغ)
- score من 0 إلى 100
- suggestedSellingPrice بالدولار مع هامش ~${margin}%

المنتج:
العنوان الأصلي: ${listing.title}
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
      max_tokens: 900,
      temperature: 0.35,
    });

    const text = this.extractAiText(result);
    const parsed = this.parseJsonFromText(text);

    const pros = Array.isArray(parsed.pros) ? parsed.pros.map(String) : [];
    const hookAr = normalizeHookAr(String(parsed.hookAr || ""));
    const adCopyAr = String(parsed.adCopyAr || "");
    const suggestedTitle = String(parsed.suggestedTitle || listing.title);
    const descriptionAr =
      String(parsed.descriptionAr || "").trim() ||
      buildArabicDescriptionHtml({
        hookAr,
        adCopyAr,
        pros,
        title: suggestedTitle,
      });

    return {
      approved: Boolean(parsed.approved),
      score: Math.round(Number(parsed.score) || 0),
      reason: String(parsed.reason || "تحليل Workers AI"),
      suggestedTitle,
      hookAr,
      suggestedSellingPrice: Number(parsed.suggestedSellingPrice) || undefined,
      adCopyAr,
      descriptionAr,
      pros,
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
