import { describe, expect, it } from "vitest";
import { formatMobile, normalizeIranMobile } from "./phone";

describe("normalizeIranMobile", () => {
  it("accepts what people type", () => {
    for (const input of ["09121234567", "9121234567", "+98 912 123 4567", "00989121234567", "۰۹۱۲-۱۲۳-۴۵۶۷"]) {
      expect(normalizeIranMobile(input)).toBe("+989121234567");
    }
  });

  it("rejects landlines and foreign numbers", () => {
    for (const input of ["02112345678", "+447911123456", "0912123", ""]) {
      expect(normalizeIranMobile(input)).toBeNull();
    }
  });
});

describe("formatMobile", () => {
  it("groups the national number in Persian digits", () => {
    expect(formatMobile("+989121234567")).toBe("۰۹۱۲ ۱۲۳ ۴۵۶۷");
  });
});
