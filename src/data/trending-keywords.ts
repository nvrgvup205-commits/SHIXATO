import keywordsJson from "./trending-keywords.json";
import { findCategory } from "./categories";

const KEYWORDS_BY_CATEGORY = keywordsJson as Record<string, string[]>;

/** Default keywords per category id — update weekly from Google Trends (manual). */
export function getTrendingKeywords(
  categoryId: string,
  limit = 20,
): string[] {
  const id = categoryId.trim().toLowerCase();
  const fromFile = KEYWORDS_BY_CATEGORY[id];
  if (fromFile?.length) {
    return fromFile.slice(0, limit);
  }

  const cat = findCategory(id);
  if (!cat) return [];

  const base = cat.query.trim();
  const suffixes = [
    "organizer",
    "holder",
    "storage",
    "smart",
    "multi function",
    "portable",
    "upgrade",
    "solution",
  ];

  const generated = [
    base,
    ...suffixes.map((s) => `${base} ${s}`),
    ...suffixes.map((s) => `${s} ${base}`),
  ];

  const unique = [...new Set(generated.map((q) => q.trim()).filter((q) => q.length >= 3))];
  return unique.slice(0, limit);
}

export function listCategoriesWithKeywords(): string[] {
  return Object.keys(KEYWORDS_BY_CATEGORY);
}
