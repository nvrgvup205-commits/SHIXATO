import type { ProductSearchFilters } from "../types";

export type DropshipGrade = "starter" | "balanced" | "pro";

export interface DropshipPreset {
  id: DropshipGrade;
  labelAr: string;
  emoji: string;
  descAr: string;
  tipAr: string;
  /** English wholesale terms — one is chosen at random per click */
  queries: string[];
  filters: Omit<ProductSearchFilters, "query" | "category" | "page">;
}

/** Curated dropshipping search presets — category-agnostic, rotate queries */
export const DROPSHIP_PRESETS: DropshipPreset[] = [
  {
    id: "starter",
    emoji: "🥉",
    labelAr: "مبتدئ — اكتشاف",
    descAr: "منتجات مبيعاتها مثبتة بفلاتر خفيفة — مناسب للتجربة الأولى",
    tipAr: "ابدأ هنا لو لسه بتختبر السوق. ركّز على 3–5 منتجات وجرّب إعلان بسيط.",
    queries: [
      "kitchen gadgets",
      "phone accessories",
      "car organizer",
      "led strip lights",
      "storage organizer",
      "pet hair remover",
      "cool gadgets",
      "home decor",
      "travel accessories",
      "smart watch",
    ],
    filters: {
      sort: "orders",
      locale: "ar",
      minPrice: 3,
      maxPrice: 40,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 200,
      minRating: 4.2,
      minReviews: 20,
      maxNegativeRate: 25,
      choiceOnly: true,
      excludeKeywords: "replica,fake,used,broken,wholesale lot,sample",
    },
  },
  {
    id: "balanced",
    emoji: "🥈",
    labelAr: "متوسط — منتجات قوية",
    descAr: "توازن بين المبيعات والتقييم والهامش — الأنسب لمعظم المتاجر",
    tipAr: "الأكثر استخدامًا. اختر منتج بسيط (بدون مقاسات) وهامش 40%+ بعد الشحن.",
    queries: [
      "wireless earbuds",
      "portable blender",
      "phone holder car",
      "massage gun",
      "power bank charger",
      "hijab magnet pin",
      "security camera mini",
      "cleaning tools",
      "gaming accessories",
      "smart home",
    ],
    filters: {
      sort: "orders",
      locale: "ar",
      minPrice: 5,
      maxPrice: 35,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 500,
      minRating: 4.5,
      minReviews: 80,
      maxNegativeRate: 18,
      minDiscountPercent: 20,
      targetSellingPrice: 79,
      minMarginPercent: 38,
      choiceOnly: true,
      freeShipping: true,
      highRatedSellers: true,
      excludeKeywords: "replica,fake,used,broken,wholesale lot,sample,defective",
    },
  },
  {
    id: "pro",
    emoji: "🥇",
    labelAr: "محترف — الأفضل",
    descAr: "فلاتر صارمة: مبيعات عالية + تقييم ممتاز + شحن مجاني + ترند",
    tipAr: "نتائج أقل لكن جودة أعلى. مثالي قبل إنفاق ميزانية إعلانات.",
    queries: [
      "viral trending products",
      "bestseller gadgets",
      "car vacuum cleaner",
      "mini projector",
      "portable fan usb",
      "water bottle smart",
      "pet supplies",
      "outdoor camping gear",
      "beauty tools",
      "tablet accessories",
    ],
    filters: {
      sort: "orders",
      locale: "ar",
      minPrice: 6,
      maxPrice: 30,
      currency: "USD",
      shipToCountry: "SA",
      minSold: 1000,
      minRating: 4.6,
      minReviews: 150,
      maxNegativeRate: 12,
      minDiscountPercent: 25,
      targetSellingPrice: 99,
      minMarginPercent: 42,
      choiceOnly: true,
      freeShipping: true,
      highRatedSellers: true,
      requireFreeShippingBadge: true,
      excludeKeywords:
        "replica,fake,used,broken,wholesale lot,sample,defective,counterfeit",
    },
  },
];

export function pickPresetQuery(preset: DropshipPreset): string {
  const idx = Math.floor(Math.random() * preset.queries.length);
  return preset.queries[idx] ?? preset.queries[0] ?? "cool gadgets";
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
  };
}
