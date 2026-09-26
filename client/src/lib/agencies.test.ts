import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, formatRating, slugify } from "./agencies";

describe("formatRating", () => {
  it("always shows one Persian decimal", () => {
    expect(formatRating(4.6)).toBe("۴٫۶");
    expect(formatRating(5)).toBe("۵٫۰");
  });
});

describe("slugify", () => {
  it("turns free text into a valid address", () => {
    expect(slugify("Sky Travel!")).toBe("sky-travel");
    expect(slugify("  --Parvaz  24/7-- ")).toBe("parvaz-24-7");
    expect(SLUG_PATTERN.test(slugify("Sky Travel!"))).toBe(true);
  });

  it("gives nothing for text with no Latin letters or digits", () => {
    expect(slugify("آسمان بازار")).toBe("");
  });
});
