import { describe, expect, it } from "vitest";
import { DROPSHIP_PRESETS, buildPresetSearch, findPreset } from "../data/dropship-presets";

describe("dropship-presets", () => {
  it("defines three graded presets", () => {
    expect(DROPSHIP_PRESETS.map((p) => p.id)).toEqual([
      "starter",
      "balanced",
      "pro",
    ]);
  });

  it("buildPresetSearch uses selected category query", () => {
    const filters = buildPresetSearch("balanced", {
      category: "phones",
      shipToCountry: "SA",
    });
    expect(filters.locale).toBe("ar");
    expect(filters.query).toBe("phone accessories");
    expect(filters.category).toBe("phones");
    expect(filters.minSold).toBe(80);
    expect(filters.presetGrade).toBe("balanced");
  });

  it("requires category when no manual query", () => {
    expect(() => buildPresetSearch("starter", {})).toThrow("CATEGORY_REQUIRED");
  });

  it("allows free-text query without category", () => {
    const filters = buildPresetSearch("starter", { query: "wireless charger" });
    expect(filters.query).toBe("wireless charger");
  });

  it("findPreset returns preset by id", () => {
    expect(findPreset("pro")?.labelAr).toBe("محترف");
  });
});
