import type { AliExpressListing } from "../types";
import {
  heuristicTitleHaystack,
  isGenericTitleInHaystack,
  isProblemSolvingInHaystack,
} from "../utils/listing-discovery";
import { isHardBannedListing } from "./discover-scoring";

/** Curiosity / «يثبت الإنسان» signals in English product titles */
const WOW_SIGNAL_RE =
  /\b(ingenious|clever|genius|magic|transform|folding|foldable|magnetic|360|rotat|retract|auto|self[\s-]?|instant|one[\s-]?click|no[\s-]?drill|space[\s-]?saving|hidden|secret|surprise|unique|innovat|revolution|lifehack|must[\s-]?have|game[\s-]?changer|multi[\s-]?use|2[\s-]?in[\s-]?1|3[\s-]?in[\s-]?1|portable|compact|mini(?!mal)|upgrade|hack|relief|fix|solve|organiz|holder|dispenser|stretch|silicone|vacuum|waterproof|recharge|wireless|touchless|sensor|led|glow)\b/i;

const PAIN_POINT_RE =
  /\b(no more|stop|prevent|avoid|tired of|messy|tangle|clutter|chaos|spill|leak|slip|scratch|dust|odor|pain|stress|frustrat|struggle|waste|lost|missing|broken|stuck|crowded|small space|tight space|under seat|gap filler|cord chaos|cable mess)\b/i;

const ARABIC_WOW_RE =
  /(ذكي|مبتكر|سحر|تحويل|مغناطيس|لاسلكي|فوري|تلقائي|مضغوط|محمول|مقاوم|مضاد|بدون|تعب|فوضى|ترتيب|تنظيم|حل|مشكلة|راحة|سهل|سريع)/u;

export interface WowHeuristicResult {
  wowScore: number;
  problemClarity: number;
  curiosity: number;
  visualReady: number;
  flags: string[];
}

function clamp(n: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Wow-first scoring — de-emphasizes sales/ratings; focuses on problem + curiosity + visuals.
 * Returns 0–10 wow score.
 */
export function computeWowHeuristic(
  listing: AliExpressListing,
  matchedKeyword?: string,
): WowHeuristicResult {
  const flags: string[] = [];
  const haystack = heuristicTitleHaystack(
    listing.title,
    listing.titleEn,
    matchedKeyword,
  );

  if (isHardBannedListing(listing, matchedKeyword)) {
    return {
      wowScore: 1,
      problemClarity: 0,
      curiosity: 0,
      visualReady: 0,
      flags: ["مرفوض"],
    };
  }

  let problemClarity = 4;
  if (isProblemSolvingInHaystack(haystack)) problemClarity = 9;
  else if (PAIN_POINT_RE.test(haystack)) problemClarity = 8;
  else if (listing.problemSolvingTitle) problemClarity = 7;

  let curiosity = 4;
  if (WOW_SIGNAL_RE.test(haystack)) curiosity = 9;
  else if (ARABIC_WOW_RE.test(haystack)) curiosity = 8;
  else if (/\b(smart|new|pro|plus|ultra)\b/i.test(haystack)) curiosity = 6;

  let visualReady = 3;
  const imgCount = listing.images?.length ?? (listing.image ? 1 : 0);
  if (imgCount >= 5) {
    visualReady = 9;
    flags.push("صور كثيرة");
  } else if (imgCount >= 3) {
    visualReady = 7;
  } else if (imgCount >= 1) {
    visualReady = 5;
  } else {
    visualReady = 2;
    flags.push("بدون صور");
  }

  if (isGenericTitleInHaystack(haystack) && problemClarity < 7) {
    problemClarity = Math.min(problemClarity, 3);
    flags.push("عام/مكرر");
  }

  if (problemClarity >= 8) flags.push("مشكلة واضحة");
  if (curiosity >= 8) flags.push("يثبت العين");
  if (listing.isChoice) flags.push("Choice");
  if (listing.isFreeShipping) flags.push("شحن مجاني");

  const wowScore = clamp(
    problemClarity * 0.45 + curiosity * 0.35 + visualReady * 0.2,
  );

  return { wowScore, problemClarity, curiosity, visualReady, flags };
}

export function wowToDisplayScore(wow: number): number {
  return clamp(wow * 10, 0, 100);
}

export function passesWowGate(wowScore: number, minWow = 7): boolean {
  return wowScore >= minWow;
}

export function explainWowReject(wowScore: number, flags: string[], minWow = 7): string {
  if (flags.includes("مرفوض")) return "مرفوض: جملة/مقلد";
  if (wowScore < minWow) return `إبهار ${wowScore}/10 — أقل من ${minWow}`;
  return flags.join(" · ") || "لم يمرّ";
}
