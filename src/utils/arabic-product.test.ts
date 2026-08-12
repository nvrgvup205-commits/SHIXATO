import { describe, expect, it } from "vitest";
import {
  buildArabicDescriptionHtml,
  normalizeHookAr,
  resolveArabicDescriptionHtml,
} from "../utils/arabic-product";

describe("normalizeHookAr", () => {
  it("keeps one short human line", () => {
    expect(normalizeHookAr("تعبك من الفوضى؟ هالقطعة تحلها لك.")).toBe(
      "تعبك من الفوضى؟ هالقطعة تحلها لك",
    );
  });
});

describe("buildArabicDescriptionHtml", () => {
  it("builds Arabic HTML from hook and pros", () => {
    const html = buildArabicDescriptionHtml({
      hookAr: "تعبك من الفوضى؟",
      adCopyAr: "جرّبها الحين.",
      pros: ["سهل", "رخيص"],
    });
    expect(html).toContain("تعبك من الفوضى؟");
    expect(html).toContain("<ul>");
    expect(html).toContain("سهل");
  });
});

describe("resolveArabicDescriptionHtml", () => {
  it("wraps plain descriptionAr in paragraphs", () => {
    const html = resolveArabicDescriptionHtml({
      aliexpressId: "1",
      title: "منتج",
      url: "https://example.com",
      image: "",
      originalPrice: 10,
      currency: "USD",
      descriptionAr: "سطر أول\n\nسطر ثاني",
    });
    expect(html).toContain("<p>سطر أول</p>");
    expect(html).toContain("<p>سطر ثاني</p>");
  });
});
