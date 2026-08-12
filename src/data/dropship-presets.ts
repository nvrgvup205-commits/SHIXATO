import { resolveSearchQuery } from "./categories";
import type { ProductSearchFilters } from "../types";

export type DropshipGrade = "starter" | "balanced" | "pro";

export interface DropshipPreset {
  id: DropshipGrade;
  labelAr: string;
  emoji: string;
  descAr: string;
  tipAr: string;
  /** Scoring hints — applied in soft mode, not as hard URL filters */
  filters: Omit<ProductSearchFilters, "query" | "category" | "page">;
}

/**
 * Grade presets tune filters/scoring only.
 * Search scope comes from the dashboard category picker (required for smart search).
 */
export const DROPSHIP_PRESETS: DropshipPreset[] = [
  {
    id: "starter",
    emoji: "🥉",
    labelAr: "مبتدئ",
    descAr: "اكتشاف واسع داخل الفئة — أكبر عدد نتائج",
    tipAr: "اختر الفئة أولًا. للتجربة: اختر 3 منتجات واختبر إعلانًا بسيطًا.",
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
    descAr: "توازن مبيعات + تقييم داخل الفئة — الأنسب يوميًا",
    tipAr: "اختر الفئة ثم 🥈. ركّز على منتج بسيط وهامش 35%+.",
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
    descAr: "أعلى جودة داخل الفئة — مبيعات وتقييم قوي",
    tipAr: "اختر الفئة ثم 🥇. نتائج أقل لكن أدق قبل ميزانية الإعلانات.",
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

export function findPreset(id: string): DropshipPreset | undefined {
  return DROPSHIP_PRESETS.find((p) => p.id === id);
}

export function buildPresetSearch(
  grade: DropshipGrade,
  overrides?: Partial<ProductSearchFilters>,
): ProductSearchFilters {
  const preset = findPreset(grade);
  if (!preset) throw new Error(`Unknown preset: ${grade}`);

  const category = overrides?.category;
  const resolved = resolveSearchQuery({
    query: overrides?.query,
    category,
  });

  if (!resolved.query || resolved.query.length < 2) {
    throw new Error("CATEGORY_REQUIRED");
  }

  return {
    ...preset.filters,
    ...overrides,
    query: resolved.query,
    category: resolved.categoryId ?? category,
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
