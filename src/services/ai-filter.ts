import type { AiFilterResult, AliExpressProduct, Env } from "../types";

/**
 * Lightweight AI gate before Shopify sync.
 * Uses OpenAI-compatible chat API when OPENAI_API_KEY is set;
 * otherwise falls back to deterministic heuristic scoring.
 */
export class AiFilterService {
  constructor(private env: Env) {}

  async evaluate(product: AliExpressProduct): Promise<AiFilterResult> {
    if (this.env.OPENAI_API_KEY) {
      try {
        return await this.evaluateWithLlm(product);
      } catch {
        // Fall through to heuristic — never block the pipeline on AI outage
      }
    }
    return this.evaluateHeuristic(product);
  }

  private evaluateHeuristic(product: AliExpressProduct): AiFilterResult {
    let score = 0.55;
    const reasons: string[] = [];

    if (product.title.length >= 20) {
      score += 0.1;
      reasons.push("title length ok");
    } else {
      score -= 0.15;
      reasons.push("title too short");
    }

    if (product.images.length >= 3) {
      score += 0.15;
      reasons.push("enough images");
    } else {
      score -= 0.1;
      reasons.push("few images");
    }

    if (product.originalPrice > 0 && product.originalPrice < 500) {
      score += 0.1;
      reasons.push("price in range");
    } else if (product.originalPrice <= 0) {
      score -= 0.25;
      reasons.push("missing price");
    }

    const banned = ["adult", "weapon", "counterfeit", "replica"];
    const haystack = `${product.title} ${JSON.stringify(product.attributes)}`.toLowerCase();
    if (banned.some((w) => haystack.includes(w))) {
      score = 0.05;
      reasons.push("banned keyword");
    }

    score = Math.max(0, Math.min(1, score));
    const approved = score >= 0.55;

    return {
      approved,
      score: Math.round(score * 100) / 100,
      reason: reasons.join("; ") || "heuristic",
      suggestedTitle: product.title,
      tags: ["auto-filter"],
    };
  }

  private async evaluateWithLlm(product: AliExpressProduct): Promise<AiFilterResult> {
    const baseUrl = (this.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    const model = this.env.OPENAI_MODEL || "gpt-4o-mini";

    const prompt = {
      role: "user",
      content: `You are a dropshipping catalog QA filter for a Shopify store.
Return ONLY compact JSON: {"approved":boolean,"score":number,"reason":string,"suggestedTitle":string,"tags":string[]}
Approve general consumer products that look sellable. Reject adult, weapons, counterfeit, empty, or unusable listings.

Title: ${product.title}
Price: ${product.originalPrice} ${product.currency}
Images: ${product.images.length}
Category: ${product.category ?? "n/a"}
Attributes: ${JSON.stringify(product.attributes).slice(0, 800)}`,
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You output strict JSON only for product approval decisions.",
          },
          prompt,
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}`);
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty LLM response");

    const parsed = JSON.parse(content) as AiFilterResult;
    return {
      approved: Boolean(parsed.approved),
      score: Number(parsed.score) || 0,
      reason: parsed.reason || "llm",
      suggestedTitle: parsed.suggestedTitle || product.title,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ["ai-filter"],
    };
  }
}
