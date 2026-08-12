import type { AliExpressListing, Env } from "../types";
import { computeWowHeuristic } from "./wow-scoring";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

export interface WowAiInsight {
  aliexpressId: string;
  wowScore: number;
  stopReasonAr: string;
  problemAr: string;
  approved: boolean;
}

/**
 * One batch Workers AI call — evaluates up to 18 candidates for «إبهار + حل مشكلة».
 */
export class WowAnalyzerService {
  constructor(private env: Env) {}

  async analyzeBatch(
    listings: AliExpressListing[],
    categoryLabelAr: string,
    minWow = 7,
  ): Promise<Map<string, WowAiInsight>> {
    const out = new Map<string, WowAiInsight>();
    if (!this.env.AI || listings.length === 0) return out;

    const batch = listings.slice(0, 18);
    const lines = batch.map((l, i) => {
      const h = computeWowHeuristic(l);
      return `${i + 1}. id=${l.aliexpressId} | title="${l.title.slice(0, 120)}" | price=${l.originalPrice} | wowH=${h.wowScore}`;
    });

    const prompt = `أنت خبير منتجات دروب شيبنج للسعودية. تقيّم «إبهار المتجر» — هل المنتج يجعل الإنسان يثبت ويفكر «هذا يحل مشكلة»؟

الفئة: ${categoryLabelAr}
لا تعتمد على أرقام المبيعات — ركّز على: وضوح المشكلة، التميز، سهولة التسويق، هل العميل يشتري 2-3 قطع؟

المنتجات:
${lines.join("\n")}

أرجع JSON فقط:
{"items":[{"id":"aliexpress_id","wow":number,"problemAr":"المشكلة بالعربي","stopReasonAr":"جملة لماذا يثبت الإنسان","approved":boolean}]}

قواعد wow (1-10):
- 9-10: مشكلة يومية واضحة + منتج مميز + أي شخص يفهمها في 3 ثواني
- 7-8: جيد للمتجر — يحل مشكلة حقيقية
- 4-6: عادي — مكرر أو غير واضح
- 1-3: ملصقات/عشوائي/ما يحل مشكلة

approved=true فقط إذا wow >= ${minWow} وليس generic junk.`;

    try {
      const result = await this.env.AI.run(MODEL, {
        messages: [
          {
            role: "system",
            content: "JSON only. wow is 1-10 integer. Arabic text in problemAr and stopReasonAr.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 1200,
        temperature: 0.35,
      });

      const text = this.extractText(result);
      const parsed = this.parseJson(text);
      const items = parsed.items;
      if (!Array.isArray(items)) return out;

      for (const row of items) {
        const id = String((row as Record<string, unknown>).id ?? "").replace(/\D/g, "");
        if (!id) continue;
        const wow = Number((row as Record<string, unknown>).wow);
        const wowScore = Number.isFinite(wow) ? Math.max(1, Math.min(10, Math.round(wow))) : 0;
        out.set(id, {
          aliexpressId: id,
          wowScore,
          problemAr: String((row as Record<string, unknown>).problemAr ?? "").trim(),
          stopReasonAr: String((row as Record<string, unknown>).stopReasonAr ?? "").trim(),
          approved: Boolean((row as Record<string, unknown>).approved) && wowScore >= minWow,
        });
      }
    } catch (err) {
      console.warn("WowAnalyzer batch failed", err);
    }

    return out;
  }

  private extractText(result: unknown): string {
    if (!result || typeof result !== "object") return "";
    const r = result as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
    if (typeof r.result === "string") return r.result;
    return JSON.stringify(result);
  }

  private parseJson(text: string): Record<string, unknown> {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) return {};
      return JSON.parse(match[0]!) as Record<string, unknown>;
    }
  }
}
