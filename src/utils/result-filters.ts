/** Client-side post-search filter/sort helpers (mirrored in dashboard script). */

export type PostSort =
  | "default"
  | "price_asc"
  | "price_desc"
  | "sold_desc"
  | "sold_asc"
  | "rating_desc";

export type PostShipping = "all" | "free" | "paid";

export interface PostFilterOptions {
  sort: PostSort;
  shipping: PostShipping;
  choiceOnly: boolean;
  highRated: boolean;
}

export interface ResultFilterItem {
  originalPrice?: number;
  soldCount?: number;
  sold?: string;
  rating?: number;
  shippingType?: string;
  isFreeShipping?: boolean;
  isChoice?: boolean;
}

export function itemPrice(item: ResultFilterItem): number {
  const p = Number(item.originalPrice);
  return Number.isFinite(p) ? p : 0;
}

export function itemSold(item: ResultFilterItem): number {
  if (item.soldCount != null) return Number(item.soldCount) || 0;
  const s = String(item.sold || "");
  const m = s.match(/([\d,.]+)\s*([kK])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  if (m[2]) n *= 1000;
  return n;
}

export function itemIsFreeShipping(item: ResultFilterItem): boolean {
  return (
    item.shippingType === "free" ||
    item.shippingType === "conditional_free" ||
    Boolean(item.isFreeShipping)
  );
}

export function filterAndSortResults<T extends ResultFilterItem>(
  items: T[],
  opts: PostFilterOptions,
): T[] {
  let out = [...items];

  if (opts.shipping === "free") {
    out = out.filter(itemIsFreeShipping);
  } else if (opts.shipping === "paid") {
    out = out.filter((i) => !itemIsFreeShipping(i));
  }

  if (opts.choiceOnly) {
    out = out.filter((i) => Boolean(i.isChoice));
  }

  if (opts.highRated) {
    out = out.filter((i) => (Number(i.rating) || 0) >= 4.5);
  }

  switch (opts.sort) {
    case "price_asc":
      out.sort((a, b) => itemPrice(a) - itemPrice(b));
      break;
    case "price_desc":
      out.sort((a, b) => itemPrice(b) - itemPrice(a));
      break;
    case "sold_desc":
      out.sort((a, b) => itemSold(b) - itemSold(a));
      break;
    case "sold_asc":
      out.sort((a, b) => itemSold(a) - itemSold(b));
      break;
    case "rating_desc":
      out.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
      break;
    default:
      break;
  }

  return out;
}
