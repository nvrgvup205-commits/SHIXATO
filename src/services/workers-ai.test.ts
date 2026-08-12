import { describe, expect, it } from "vitest";
import { hasArabicText } from "../services/workers-ai";

describe("hasArabicText", () => {
  it("detects Arabic script", () => {
    expect(hasArabicText("حامل جوال للسيارة")).toBe(true);
    expect(hasArabicText("FIFINE USB Microphone")).toBe(false);
  });
});
