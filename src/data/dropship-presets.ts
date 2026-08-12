import { resolveSearchQuery } from "./categories";
import type { ProductSearchFilters } from "../types";

export type DropshipGrade = "starter" | "balanced" | "pro";

const CURRENT_YEAR = new Date().getUTCFullYear();

const DISCOVERY_EXCLUDES =
  "replica,fake,counterfeit,sticker,stickers,coloring book,random style,assorted,wholesale,bulk lot,mixed styles,generic";

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
 * Grade presets tune discovery/trust filters.
 * Search scope comes from the dashboard category picker.
 */
export const DROPSHIP_PRESETS: DropshipPreset[] = [
  {
    id: "starter",
    emoji: "🥉",
    labelAr: "مبتدئ",
    descAr: "اكتشاف داخل الفئة — يفضّل منتجات صادقة وحلّ مشاكل",
    tipAr: "اختر الفئة أولًا. نتائج أقل لكن أصدق من البحث العشوائي.",
    filters: {
      sort: "newest",
      locale: "ar",
      filterMode: "soft",
      discoveryMode: true,
      minLaunchYear: CURRENT_YEAR,
      applyUrlFilters: false,
      fetchPages: 2,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 80,
      minRating: 4.2,
      minReviews: 15,
      maxNegativeRate: 28,
      excludeKeywords: DISCOVERY_EXCLUDES,
    },
  },
  {
    id: "balanced",
    emoji: "🥈",
    labelAr: "متوسط",
    descAr: "توازن — منتجات تميّز + مصداقية + سنة حالية",
    tipAr: "الأفضل يوميًا: فئة واضحة + 🥈. ركّز على حل مشكلة حقيقية.",
    filters: {
      sort: "newest",
      locale: "ar",
      filterMode: "soft",
      discoveryMode: true,
      minLaunchYear: CURRENT_YEAR,
      applyUrlFilters: false,
      fetchPages: 2,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 200,
      minRating: 4.4,
      minReviews: 25,
      maxNegativeRate: 22,
      minDiscountPercent: 8,
      targetSellingPrice: 79,
      minMarginPercent: 30,
      excludeKeywords: DISCOVERY_EXCLUDES + ",used,broken",
    },
  },
  {
    id: "pro",
    emoji: "🥇",
    labelAr: "محترف",
    descAr: "أقوى فلتر — تميّز عالي + أرقام منطقية + 2026",
    tipAr: "نتائج أقل لكن «رهيبة». مثالي قبل إنفاق ميزانية إعلانات.",
    filters: {
      sort: "newest",
      locale: "ar",
      filterMode: "soft",
      discoveryMode: true,
      minLaunchYear: CURRENT_YEAR,
      applyUrlFilters: false,
      fetchPages: 3,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 300,
      minRating: 4.5,
      minReviews: 40,
      maxNegativeRate: 18,
      minDiscountPercent: 12,
      targetSellingPrice: 99,
      minMarginPercent: 35,
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
    minLaunchYear: CURRENT_YEAR,
    applyUrlFilters: false,
  };
}

export function presetMinScore(grade: DropshipGrade): number {
  if (grade === "pro") return 62;
  if (grade === "balanced") return 52;
  return 42;
}
