import type { AiFilterResult, AliExpressListing, Env } from "../types";
import {
  buildArabicDescriptionHtml,
  normalizeHookAr,
} from "../utils/arabic-product";
import {
  computeDiscoveryScore,
  isSuspiciousMetrics,
} from "../utils/listing-discovery";

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

    const discovery = computeDiscoveryScore(listing);
    let score = discovery.discoveryScore;
    const pros: string[] = [];
    const cons: string[] = [];

    if (discovery.problemSolvingTitle) {
      pros.push("يحل مشكلة واضحة");
      score += 6;
    } else {
      cons.push("العنوان يبدو عامًا");
      score -= 8;
    }

    if (discovery.isCurrentYear) pros.push("منتج جديد " + new Date().getUTCFullYear());
    else cons.push("قد يكون قديم أو تاريخه غير واضح");

    if (discovery.suspiciousMetrics || isSuspiciousMetrics(listing)) {
      cons.push("أرقام مبيعات/تقييمات غير منطقية");
      score = Math.min(score, 35);
    } else if ((listing.reviewCount ?? 0) >= 20) {
      pros.push("أرقام تقييم معقولة");
      score += 5;
    }

    if ((listing.rating ?? 0) >= 4.5) {
      pros.push("تقييم ممتاز");
    } else if ((listing.rating ?? 0) < 4.0) {
      cons.push("تقييم منخفض");
      score -= 8;
    }

    if (listing.isFreeShipping) pros.push("شحن مجاني");
    if (listing.isChoice) pros.push("AliExpress Choice");
    if (cost > 0 && cost < 30) pros.push("سعر شراء مناسب للدروب شيبنج");
    if (cost <= 0) {
      score -= 20;
      cons.push("السعر غير واضح");
    }

    if (discovery.genericTitle && !discovery.problemSolvingTitle) {
      cons.push("منتج مكرر/عام (ملصقات، عشوائي…)");
      score -= 12;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const approved = score >= 58 && !discovery.suspiciousMetrics;
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

    const suspicious = isSuspiciousMetrics(listing);
    const sold = listing.soldCount ?? 0;
    const reviews = listing.reviewCount ?? 0;
    const ratio =
      sold > 0 && reviews > 0 ? (sold / reviews).toFixed(1) : "غير معروف";
    const discovery = computeDiscoveryScore(listing);

    const prompt = `أنت خبير دروب شيبنج سعودي (TikTok/Snap) ومهمتك اختيار منتجات «رهيبة» — تحل مشكلة حقيقية، ترندية، مو مكررة، وهوكها قوي.
حلّل منتج AliExpress وأرجع JSON فقط:
{"approved":boolean,"score":number,"reason":string,"suggestedTitle":string,"hookAr":string,"suggestedSellingPrice":number,"adCopyAr":string,"descriptionAr":string,"pros":string[],"cons":string[],"tags":string[]}

معايير score (مهم جدًا — لا تعطي 90+ لأي منتج عادي):
- 85-100: يحل مشكلة يومية واضحة + مميز + ترندي + هوك قوي + أرقام معقولة
- 65-84: جيد لكن أقل تميزًا أو أقل ترند
- 45-64: عادي / مكرر / صعب تسويقه
- أقل من 45: مرفوض — generic، ملصقات، wholesale، أرقام مشبوهة

خصم شديد إذا:
- العنوان generic (stickers, random style, coloring book, wholesale…)
- مبيعات عالية جدًا مقابل تقييمات قليلة (نسبة مشبوهة) — فقط إذا الأرقام متوفرة
- المنتج ما يحل مشكلة محددة

مهم: إذا المبيعات أو عدد التقييمات «غير معروف» — AliExpress لم يعرضها في الكارت. لا تضفها في cons ولا تعاقب المنتج بسببها. ركّز على الإبهار وحل المشكلة.

قواعد الهوك hookAr:
- جملة واحدة قصيرة (6–12 كلمة) بلهجة سعودية بشرية
- تبدأ بمشكلة يومية ثم تلمّح للحل
- ممنوع مبالغة مزيفة

قواعد باقي النصوص:
- suggestedTitle: عنوان متجر عربي سعودي واضح
- adCopyAr: جملتين كحد أقصى
- descriptionAr: وصف HTML بسيط (<p>, <ul><li>) يبرز المشكلة والحل
- suggestedSellingPrice بالدولار مع هامش ~${margin}%
- approved=true فقط إذا score >= 58 وليس مقلد/سلاح/بالغ وليست الأرقام مشبوهة

إشارات النظام:
- discoveryScore: ${discovery.discoveryScore}/100
- أرقام مشبوهة: ${suspicious ? "نعم — خفّض السكور" : "لا"}
- نسبة مبيعات/تقييمات: ${ratio}
- سنة الإدراج: ${listing.launchYear ?? discovery.launchYear ?? "غير معروف"}
- يحل مشكلة (تحليل عنوان): ${discovery.problemSolvingTitle ? "نعم" : "ضعيف"}
- عنوان generic: ${discovery.genericTitle ? "نعم — خصم" : "لا"}

المنتج:
العنوان الأصلي: ${listing.title}
السعر: ${listing.originalPrice} ${listing.currency}
المبيعات: ${sold || "غير معروف"}
التقييم: ${listing.rating ?? "غير معروف"}
عدد التقييمات: ${reviews || "غير معروف"}
شحن مجاني: ${listing.isFreeShipping ? "نعم" : "لا"}
Choice: ${listing.isChoice ? "نعم" : "لا"}
تاريخ الإدراج: ${listing.storeLaunchDate ?? "غير معروف"}
تكلفة الشحن للسعودية: ${listing.shippingCost != null ? `${listing.shippingCost} ${listing.shippingCostCurrency ?? "SAR"}` : "غير معروف"}
مدة التوصيل: ${listing.deliveryEstimate ?? "غير معروف"}
الفئة: ${listing.categoryName ?? "غير معروف"}
المتجر: ${listing.storeName ?? "غير معروف"}
وصف المنتج (مختصر): ${listing.descriptionEn ? listing.descriptionEn.slice(0, 400) : "غير متوفر"}
مصادر البيانات: ${listing.enrichmentSources?.join(", ") || "كارت بحث فقط"}`;

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
