/**
 * Dashboard product categories (~50).
 * `query` is the English AliExpress wholesale search term used when
 * the user leaves the free-text search box empty.
 */
export interface ProductCategory {
  id: string;
  labelAr: string;
  query: string;
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: "cars", labelAr: "سيارات واكسسوارات", query: "car accessories" },
  { id: "motorcycles", labelAr: "دراجات نارية", query: "motorcycle accessories" },
  { id: "kids-toys", labelAr: "ألعاب أطفال", query: "kids toys" },
  { id: "baby", labelAr: "مستلزمات أطفال ورضع", query: "baby products" },
  { id: "women-fashion", labelAr: "حريمي ملابس", query: "women fashion" },
  { id: "men-fashion", labelAr: "رجالي ملابس", query: "men fashion" },
  { id: "women-bags", labelAr: "شنط حريمي", query: "women handbags" },
  { id: "men-bags", labelAr: "شنط رجالي", query: "men bags" },
  { id: "shoes-women", labelAr: "أحذية حريمي", query: "women shoes" },
  { id: "shoes-men", labelAr: "أحذية رجالي", query: "men shoes" },
  { id: "jewelry", labelAr: "مجوهرات واكسسوارات", query: "jewelry" },
  { id: "watches", labelAr: "ساعات", query: "watches" },
  { id: "beauty", labelAr: "تجميل وعناية", query: "beauty makeup" },
  { id: "perfume", labelAr: "عطور", query: "perfume" },
  { id: "hair", labelAr: "شعر ومستلزماته", query: "hair accessories" },
  { id: "phones", labelAr: "جوالات واكسسوارات", query: "phone accessories" },
  { id: "phone-cases", labelAr: "جرابات جوال", query: "phone case" },
  { id: "earphones", labelAr: "سماعات", query: "earphones" },
  { id: "smart-watches", labelAr: "ساعات ذكية", query: "smart watch" },
  { id: "tablets", labelAr: "تابلت واكسسوارات", query: "tablet accessories" },
  { id: "laptops", labelAr: "لابتوب واكسسوارات", query: "laptop accessories" },
  { id: "gaming", labelAr: "ألعاب إلكترونية", query: "gaming accessories" },
  { id: "cameras", labelAr: "كاميرات وتصوير", query: "camera accessories" },
  { id: "drones", labelAr: "درونز", query: "drone" },
  { id: "home", labelAr: "منزل ومطبخ", query: "home kitchen" },
  { id: "lighting", labelAr: "إضاءة وديكور", query: "led lights decor" },
  { id: "furniture", labelAr: "أثاث صغير", query: "home furniture" },
  { id: "storage", labelAr: "تنظيم وتخزين", query: "storage organizers" },
  { id: "cleaning", labelAr: "تنظيف منزلي", query: "cleaning tools" },
  { id: "garden", labelAr: "حديقة ونباتات", query: "garden tools" },
  { id: "tools", labelAr: "عدد وأدوات", query: "hand tools" },
  { id: "sports", labelAr: "رياضة ولياقة", query: "sports fitness" },
  { id: "outdoor", labelAr: "رحلات وتخييم", query: "camping outdoor" },
  { id: "fishing", labelAr: "صيد وأسماك", query: "fishing gear" },
  { id: "pets", labelAr: "حيوانات أليفة", query: "pet supplies" },
  { id: "office", labelAr: "مكتبي وقرطاسية", query: "office stationery" },
  { id: "school", labelAr: "مستلزمات مدرسة", query: "school supplies" },
  { id: "books", labelAr: "كتب وتعليم", query: "educational toys" },
  { id: "health", labelAr: "صحة وعناية شخصية", query: "health care" },
  { id: "medical", labelAr: "مستلزمات طبية", query: "medical supplies" },
  { id: "car-electronics", labelAr: "إلكترونيات سيارات", query: "car electronics" },
  { id: "security", labelAr: "كاميرات مراقبة وأمان", query: "security camera" },
  { id: "smart-home", labelAr: "منزل ذكي", query: "smart home" },
  { id: "power-banks", labelAr: "شواحن وباور بانك", query: "power bank charger" },
  { id: "cables", labelAr: "كيابل ومحولات", query: "usb cable adapter" },
  { id: "apparel-plus", labelAr: "ملابس مقاسات كبيرة", query: "plus size fashion" },
  { id: "muslim", labelAr: "ملابس محتشمة / حجاب", query: "hijab modest fashion" },
  { id: "wedding", labelAr: "أعراس ومناسبات", query: "wedding accessories" },
  { id: "party", labelAr: "حفلات وديكور مناسبات", query: "party decorations" },
  { id: "seasonal", labelAr: "موسمي / ترند", query: "viral trending products" },
  { id: "gadgets", labelAr: "أدوات مبتكرة Gadgets", query: "cool gadgets" },
  { id: "travel", labelAr: "سفر وشنط سفر", query: "travel accessories" },
  { id: "bike", labelAr: "دراجات هوائية", query: "bicycle accessories" },
  { id: "fishing-led", labelAr: "إضاءة خارجية / LED", query: "outdoor led lights" },
];

export function findCategory(id?: string | null): ProductCategory | undefined {
  if (!id) return undefined;
  return PRODUCT_CATEGORIES.find((c) => c.id === id);
}

/** Resolve the AliExpress search text from free query and/or category. */
export function resolveSearchQuery(input: {
  query?: string;
  category?: string;
}): { query: string; categoryId?: string; categoryLabelAr?: string } {
  const free = (input.query ?? "").trim();
  const cat = findCategory(input.category);

  if (free.length >= 2) {
    return {
      query: free,
      categoryId: cat?.id,
      categoryLabelAr: cat?.labelAr,
    };
  }

  if (cat) {
    return {
      query: cat.query,
      categoryId: cat.id,
      categoryLabelAr: cat.labelAr,
    };
  }

  return { query: "" };
}
