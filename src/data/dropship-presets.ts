import type { ProductSearchFilters } from "../types";

export type DropshipGrade = "starter" | "balanced" | "pro";

export interface DropshipPreset {
  id: DropshipGrade;
  labelAr: string;
  emoji: string;
  descAr: string;
  tipAr: string;
  queries: string[];
  /** Scoring hints — applied in soft mode, not as hard URL filters */
  filters: Omit<ProductSearchFilters, "query" | "category" | "page">;
}

/**
 * Presets use soft scoring + minimal AE URLs (no strict URL filters)
 * so results are not wiped by local filters or AE anti-bot.
 */
export const DROPSHIP_PRESETS: DropshipPreset[] = [
  {
    id: "starter",
    emoji: "🥉",
    labelAr: "مبتدئ",
    descAr: "اكتشاف واسع — أكبر عدد نتائج",
    tipAr: "للتجربة السريعة: اختر 3 منتجات واختبر إعلانًا بسيطًا.",
    queries: [
      "kitchen gadgets",
      "phone accessories",
      "car organizer",
      "led lights",
      "home decor",
      "smart watch",
      "storage box",
      "pet supplies",
      "travel bag",
      "beauty tools",
    ],
    filters: {
      sort: "orders",
      locale: "ar",
      filterMode: "soft",
      applyUrlFilters: false,
      fetchPages: 2,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 100,
      minRating: 4.0,
      minReviews: 10,
      maxNegativeRate: 30,
      excludeKeywords: "replica,fake,counterfeit",
    },
  },
  {
    id: "balanced",
    emoji: "🥈",
    labelAr: "متوسط",
    descAr: "توازن مبيعات + تقييم — الأنسب يوميًا",
    tipAr: "الأكثر استخدامًا. ركّز على منتج بسيط وهامش 35%+.",
    queries: [
      "wireless earbuds",
      "phone holder",
      "power bank",
      "massage gun",
      "portable blender",
      "hijab pin",
      "cleaning tools",
      "gaming accessories",
      "smart home",
      "car accessories",
    ],
    filters: {
      sort: "orders",
      locale: "ar",
      filterMode: "soft",
      applyUrlFilters: false,
      fetchPages: 2,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 300,
      minRating: 4.3,
      minReviews: 30,
      maxNegativeRate: 22,
      minDiscountPercent: 10,
      targetSellingPrice: 79,
      minMarginPercent: 30,
      excludeKeywords: "replica,fake,counterfeit,used",
    },
  },
  {
    id: "pro",
    emoji: "🥇",
    labelAr: "محترف",
    descAr: "أعلى جودة — مبيعات وتقييم قوي",
    tipAr: "نتائج أقل لكن أدق. مثالي قبل إنفاق ميزانية إعلانات.",
    queries: [
      "trending gadgets",
      "car vacuum",
      "mini projector",
      "portable fan",
      "water bottle",
      "security camera",
      "outdoor camping",
      "tablet accessories",
      "kitchen organizer",
      "fitness equipment",
    ],
    filters: {
      sort: "orders",
      locale: "ar",
      filterMode: "soft",
      applyUrlFilters: false,
      fetchPages: 3,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 500,
      minRating: 4.5,
      minReviews: 50,
      maxNegativeRate: 18,
      minDiscountPercent: 15,
      targetSellingPrice: 99,
      minMarginPercent: 35,
      excludeKeywords: "replica,fake,counterfeit,used,broken",
    },
  },
];

export function pickPresetQuery(preset: DropshipPreset): string {
  const idx = Math.floor(Math.random() * preset.queries.length);
  return preset.queries[idx] ?? preset.queries[0] ?? "gadgets";
}

export function findPreset(id: string): DropshipPreset | undefined {
  return DROPSHIP_PRESETS.find((p) => p.id === id);
}

export function buildPresetSearch(
  grade: DropshipGrade,
  overrides?: Partial<ProductSearchFilters>,
): ProductSearchFilters {
  const preset = findPreset(grade);
  if (!preset) throw new Error(`Unknown preset: ${grade}`);

  return {
    ...preset.filters,
    ...overrides,
    query: overrides?.query ?? pickPresetQuery(preset),
    page: 1,
    presetGrade: grade,
    filterMode: "soft",
    applyUrlFilters: false,
  };
}

export function presetMinScore(grade: DropshipGrade): number {
  if (grade === "pro") return 58;
  if (grade === "balanced") return 48;
  return 38;
}
