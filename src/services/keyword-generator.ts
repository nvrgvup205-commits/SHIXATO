import { findCategory } from "../data/categories";
import { getTrendingKeywords } from "../data/trending-keywords";
import type { Env } from "../types";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

export type KeywordSource = "workers-ai" | "file" | "generated";

export interface GeneratedKeywordsResult {
  keywords: string[];
  source: KeywordSource;
  categoryId: string;
  categoryLabelAr?: string;
}

/**
 * One Workers AI call per discover run (~400 tokens) — cheap on Cloudflare free tier.
 */
export class KeywordGeneratorService {
  constructor(private env: Env) {}

  async forCategory(categoryId: string, limit = 15): Promise<GeneratedKeywordsResult> {
    const id = categoryId.trim().toLowerCase();
    const cat = findCategory(id);
    if (!cat) {
      return { keywords: [], source: "generated", categoryId: id };
    }

    const capped = Math.min(Math.max(limit, 10), 20);

    if (this.env.AI) {
      try {
        const aiKeywords = await this.generateWithWorkersAi(cat.id, cat.labelAr, cat.query, capped);
        if (aiKeywords.length >= 8) {
          return {
            keywords: aiKeywords.slice(0, capped),
            source: "workers-ai",
            categoryId: cat.id,
            categoryLabelAr: cat.labelAr,
          };
        }
      } catch (err) {
        console.warn("Workers AI keyword generation failed, using fallback", err);
      }
    }

    const fromFile = getTrendingKeywords(cat.id, capped);
    if (fromFile.length >= 8) {
      return {
        keywords: fromFile,
        source: "file",
        categoryId: cat.id,
        categoryLabelAr: cat.labelAr,
      };
    }

    return {
      keywords: fromFile,
      source: "generated",
      categoryId: cat.id,
      categoryLabelAr: cat.labelAr,
    };
  }

  private async generateWithWorkersAi(
    categoryId: string,
    labelAr: string,
    baseQuery: string,
    limit: number,
  ): Promise<string[]> {
    const year = new Date().getUTCFullYear();
    const prompt = `You generate AliExpress wholesale search keywords for dropshipping in Saudi Arabia.

Category id: ${categoryId}
Category (Arabic): ${labelAr}
Base niche: ${baseQuery}
Year: ${year}

Return ONLY JSON: {"keywords":["english keyword 1","keyword 2",...]}

Rules:
- Exactly ${limit} keywords, each 2-5 words, English only
- Each keyword = specific product that SOLVES a daily problem (organizer, holder, fix, relief, smart, portable…)
- Trendy / viral-friendly for ${year} — problem-solving gadgets and tools
- NO generic junk: no wholesale, bulk, random style, sticker, assorted, replica, coloring book
- NO duplicate meanings — diversify sub-niches within the category
- Good for AliExpress search: concrete product names buyers search for
- Examples style: "trunk organizer", "magnetic phone car mount", "under sink storage rack"

Category examples:
- car accessories → car seat gap organizer, trunk storage box, visor phone holder…
- beauty makeup → makeup brush organizer, travel cosmetic bag, LED mirror portable…`;

    const result = await this.env.AI!.run(MODEL, {
      messages: [
        {
          role: "system",
          content: "You output strict JSON only. keywords must be an array of English strings.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 420,
      temperature: 0.45,
    });

    const text = this.extractText(result);
    const parsed = this.parseJson(text);
    const raw = parsed.keywords;

    if (!Array.isArray(raw)) return [];

    const cleaned = raw
      .map((k) => String(k).trim().toLowerCase())
      .filter((k) => k.length >= 4 && k.length <= 60)
      .filter((k) => !this.isBannedKeyword(k));

    return [...new Set(cleaned)].slice(0, limit);
  }

  private isBannedKeyword(k: string): boolean {
    return /\b(wholesale|bulk|random|sticker|replica|fake|assorted|lot of)\b/i.test(k);
  }

  private extractText(result: unknown): string {
    if (!result || typeof result !== "object") return "";
    const r = result as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
    if (typeof r.result === "string") return r.result;
    const choices = r.choices as Array<{ message?: { content?: string } }> | undefined;
    if (choices?.[0]?.message?.content) return choices[0].message.content;
    return JSON.stringify(result);
  }

  private parseJson(text: string): Record<string, unknown> {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in keyword AI response");
      return JSON.parse(match[0]!) as Record<string, unknown>;
    }
  }
}
