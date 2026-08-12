import type { AliExpressListing } from "../types";

export function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Keep hooks human and short — one problem-solving line. */
export function normalizeHookAr(hook: string, maxLen = 72): string {
  const clean = hook.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const line = clean.split(/\n/)[0]?.trim() || clean;
  const trimmed = line.replace(/\.$/, "");
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

export function buildArabicDescriptionHtml(parts: {
  hookAr?: string;
  adCopyAr?: string;
  pros?: string[];
  title?: string;
}): string {
  const blocks: string[] = [];

  if (parts.hookAr?.trim()) {
    blocks.push(`<p><strong>${escapeHtml(parts.hookAr.trim())}</strong></p>`);
  }
  if (parts.adCopyAr?.trim()) {
    blocks.push(`<p>${escapeHtml(parts.adCopyAr.trim())}</p>`);
  }
  if (parts.pros?.length) {
    const items = parts.pros
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("");
    if (items) {
      blocks.push(`<p><strong>ليش تطلبه؟</strong></p><ul>${items}</ul>`);
    }
  }
  if (parts.title?.trim() && blocks.length === 0) {
    blocks.push(`<p>${escapeHtml(parts.title.trim())}</p>`);
  }

  return blocks.join("\n") || "<p>منتج مميز — اطلبه الحين قبل ما يخلص.</p>";
}

/** Arabic Shopify body from saved listing / AI fields. */
export function resolveArabicDescriptionHtml(listing: AliExpressListing): string {
  if (listing.descriptionAr?.trim()) {
    const d = listing.descriptionAr.trim();
    if (d.includes("<")) return d;
    return d
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("\n");
  }

  return buildArabicDescriptionHtml({
    hookAr: listing.hookAr,
    adCopyAr: listing.adCopyAr,
    pros: listing.pros,
    title: listing.title,
  });
}
