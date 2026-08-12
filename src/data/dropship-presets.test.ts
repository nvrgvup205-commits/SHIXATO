import { describe, expect, it } from "vitest";
import {
  DROPSHIP_PRESETS,
  buildPresetSearch,
  findPreset,
  pickPresetQuery,
} from "../data/dropship-presets";

describe("dropship-presets", () => {
  it("defines three graded presets", () => {
    expect(DROPSHIP_PRESETS.map((p) => p.id)).toEqual([
      "starter",
      "balanced",
      "pro",
    ]);
  });

  it("buildPresetSearch sets locale ar and a query", () => {
    const filters = buildPresetSearch("balanced", { shipToCountry: "SA" });
    expect(filters.locale).toBe("ar");
    expect(filters.query && filters.query.length >= 2).toBe(true);
    expect(filters.minSold).toBe(500);
    expect(filters.presetGrade).toBe("balanced");
  });

  it("pickPresetQuery returns a string from the preset pool", () => {
    const preset = findPreset("starter");
    expect(preset).toBeTruthy();
    expect(preset!.queries).toContain(pickPresetQuery(preset!));
  });
});
