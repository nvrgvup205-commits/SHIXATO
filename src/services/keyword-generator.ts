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

  async forCategory(categoryId: string, limit = 20): Promise<GeneratedKeywordsResult> {
    const id = categoryId.trim().toLowerCase();
    const cat = findCategory(id);
    if (!cat) {
      return { keywords: [], source: "generated", categoryId: id };
    }

    const capped = Math.min(Math.max(limit, 6), 20);

    // Curated power keywords — instant, no AI wait
    const fromCurated = getTrendingKeywords(cat.id, capped);
    if (fromCurated.length >= 6) {
      return {
        keywords: fromCurated.slice(0, capped),
        source: "file",
        categoryId: cat.id,
        categoryLabelAr: cat.labelAr,
      };
    }

    if (this.env.AI) {
      try {
        const aiKeywords = await this.generateWithWorkersAi(cat.id, cat.labelAr, cat.query, capped);
        if (aiKeywords.length >= 6) {
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

    return {
      keywords: fromCurated,
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
    const prompt = `You generate AliExpress SEARCH keywords for a wow-factor dropshipping store in Saudi Arabia.

Category id: ${categoryId}
Category (Arabic): ${labelAr}
Base niche: ${baseQuery}
Year: ${year}

Return ONLY JSON: {"keywords":["english keyword 1","keyword 2",...]}

Strategy — PROBLEM-FIRST trendy keywords (not boring generic):
- Exactly ${limit} keywords, English, 2-6 words each
- Each keyword = a PAIN POINT or SCROLL-STOPPER product people instantly understand
- Think: "what makes a human stop scrolling and say this solves my problem?"
- Mix: organizers, holders, fixers, smart tools, space savers, life hacks, clever gadgets
- Diversify sub-problems within the category — no near-duplicates
- Viral/TikTok-friendly ${year} angles where natural — trending problem-solvers only
- Prefer keywords that imply a SPECIFIC fix (gap filler, cord organizer, under-sink pull out)

BANNED in keywords: wholesale, bulk, random style, sticker, assorted, replica, coloring book, lot of

Examples (car): car seat gap filler, trunk organizer expandable, magnetic hidden phone mount, cable clutter organizer seat
Examples (home): under sink organizer pull out, messy drawer divider, spice rack rotating, door hook no drill
Examples (beauty): travel makeup organizer LED, vanity brush holder dust proof, mirror folding portable`;

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
