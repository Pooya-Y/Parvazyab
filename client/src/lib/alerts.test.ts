import { describe, expect, it } from "vitest";
import { alertConditionLabel, alertWindow, alertWindowLabel, isExpiredAlert, suggestTarget } from "./alerts";
import { formatRelativeTime } from "./persian";

// 2026-09-26 12:00 Tehran
const NOW = Date.UTC(2026, 8, 26, 8, 30);

describe("alertWindow", () => {
  it("maps each scope to dates", () => {
    expect(alertWindow("any", "2026-10-05", NOW)).toEqual({});
    expect(alertWindow("day", "2026-10-05", NOW)).toEqual({ dateFrom: "2026-10-05", dateTo: "2026-10-05" });
    expect(alertWindow("around", "2026-10-05", NOW)).toEqual({ dateFrom: "2026-10-02", dateTo: "2026-10-08" });
  });

  it("never starts in the past", () => {
    expect(alertWindow("around", "2026-09-27", NOW)).toEqual({ dateFrom: "2026-09-26", dateTo: "2026-09-30" });
  });

  it("falls back to any date without a chosen day", () => {
    expect(alertWindow("day", null, NOW)).toEqual({});
  });
});

describe("labels", () => {
  it("describes the window", () => {
    expect(alertWindowLabel({ dateFrom: null, dateTo: null })).toBe("هر روز تا ۳۰ روز آینده");
    expect(alertWindowLabel({ dateFrom: "2026-09-26", dateTo: "2026-09-26" })).toBe("۴ مهر ۱۴۰۵");
    expect(alertWindowLabel({ dateFrom: "2026-09-26", dateTo: "2026-09-29" })).toBe("۴ مهر ۱۴۰۵ تا ۷ مهر ۱۴۰۵");
  });

  it("describes the condition", () => {
    expect(alertConditionLabel({ targetPrice: null })).toBe("هر کاهش قیمت ۳٪ یا بیشتر");
    expect(alertConditionLabel({ targetPrice: 2_000_000 })).toMatch(/^وقتی کمتر از ۲٬۰۰۰٬۰۰۰/);
  });

  it("knows when the dates of an alert have passed", () => {
    expect(isExpiredAlert({ dateTo: "2026-09-25" }, NOW)).toBe(true);
    expect(isExpiredAlert({ dateTo: "2026-09-26" }, NOW)).toBe(false);
    expect(isExpiredAlert({ dateTo: null }, NOW)).toBe(false);
  });

  it("suggests a round target under the current fare", () => {
    expect(suggestTarget(2_450_000)).toBe(2_200_000);
    expect(suggestTarget(null)).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  it("counts minutes and hours today, then days", () => {
    expect(formatRelativeTime(NOW - 20_000, NOW)).toBe("همین حالا");
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("۵ دقیقه پیش");
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("۳ ساعت پیش");
    // 23:00 Tehran the day before counts as yesterday, though only 13 hours ago.
    expect(formatRelativeTime(Date.UTC(2026, 8, 25, 19, 30), NOW)).toBe("دیروز");
    expect(formatRelativeTime(Date.UTC(2026, 8, 20, 8, 30), NOW)).toBe("۲۹ شهریور ۱۴۰۵");
  });
});
