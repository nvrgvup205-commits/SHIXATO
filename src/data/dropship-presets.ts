import { resolveSearchQuery } from "./categories";
import type { ProductSearchFilters } from "../types";

export type DropshipGrade = "starter" | "balanced" | "pro";

/** Hard-ban only obvious junk — user filters impressive vs not manually */
export const DISCOVERY_EXCLUDES =
  "replica,fake,counterfeit,wholesale,bulk lot,mixed styles";

export interface DropshipPreset {
  id: DropshipGrade;
  labelAr: string;
  emoji: string;
  descAr: string;
  tipAr: string;
  /** Scoring hints — rank only, never hard-exclude in soft mode */
  filters: Omit<ProductSearchFilters, "query" | "category" | "page">;
}

/**
 * Grade presets tune ranking (not exclusion).
 * All results shown — user filters impressive vs not in the dashboard.
 */
export const DROPSHIP_PRESETS: DropshipPreset[] = [
  {
    id: "starter",
    emoji: "🥉",
    labelAr: "مبتدئ",
    descAr: "أقصى نتائج — ترتيب حسب الإبهار مع فلتر خفيف",
    tipAr: "اختر الفئة أولًا. كل النتائج تظهر — فلتر المبهر بعدين.",
    filters: {
      sort: "orders",
      locale: "ar",
      filterMode: "soft",
      discoveryMode: true,
      applyUrlFilters: false,
      fetchPages: 4,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 30,
      minRating: 4.0,
      minReviews: 5,
      maxNegativeRate: 35,
      excludeKeywords: DISCOVERY_EXCLUDES,
    },
  },
  {
    id: "balanced",
    emoji: "🥈",
    labelAr: "متوسط",
    descAr: "توازن — نتائج كثيرة مرتّبة حسب الجودة والإبهار",
    tipAr: "الأفضل يوميًا: فئة + 🥈. كل النتائج تظهر — رتّب يدويًا.",
    filters: {
      sort: "orders",
      locale: "ar",
      filterMode: "soft",
      discoveryMode: true,
      applyUrlFilters: false,
      fetchPages: 5,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 80,
      minRating: 4.2,
      minReviews: 10,
      maxNegativeRate: 30,
      minDiscountPercent: 5,
      targetSellingPrice: 79,
      minMarginPercent: 20,
      excludeKeywords: DISCOVERY_EXCLUDES + ",used,broken",
    },
  },
  {
    id: "pro",
    emoji: "🥇",
    labelAr: "محترف",
    descAr: "أعمق سكراب — 6 صفحات + ترتيب أقوى (كل النتائج تظهر)",
    tipAr: "أقوى سكراب — نتائج أكثر. فلتر المبهر يدويًا بعد العرض.",
    filters: {
      sort: "orders",
      locale: "ar",
      filterMode: "soft",
      discoveryMode: true,
      applyUrlFilters: false,
      fetchPages: 6,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 150,
      minRating: 4.3,
      minReviews: 20,
      maxNegativeRate: 25,
      minDiscountPercent: 8,
      targetSellingPrice: 99,
      minMarginPercent: 25,
      excludeKeywords: DISCOVERY_EXCLUDES + ",used,broken,random",
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
    discoveryMode: true,
    applyUrlFilters: false,
  };
}

/** Minimum score for ranking boost — not hard exclusion */
export function presetMinScore(grade: DropshipGrade): number {
  if (grade === "pro") return 35;
  if (grade === "balanced") return 28;
  return 20;
}
