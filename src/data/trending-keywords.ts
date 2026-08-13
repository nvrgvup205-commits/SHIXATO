import keywordsJson from "./trending-keywords.json";
import { getCategorySearchKeywords } from "./category-keywords";

const KEYWORDS_BY_CATEGORY = keywordsJson as Record<string, string[]>;

/** Default keywords per category id — curated power keywords + JSON overrides. */
export function getTrendingKeywords(
  categoryId: string,
  limit = 20,
): string[] {
  const id = categoryId.trim().toLowerCase();
  const fromFile = KEYWORDS_BY_CATEGORY[id];
  const fromCurated = getCategorySearchKeywords(id, limit);

  if (fromFile?.length) {
    const merged = [...fromFile, ...fromCurated];
    return [...new Set(merged.map((q) => q.trim()).filter(Boolean))].slice(0, limit);
  }

  return fromCurated.slice(0, limit);
}

export function listCategoriesWithKeywords(): string[] {
  return Object.keys(KEYWORDS_BY_CATEGORY);
}
