import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  arrivalDayOffset,
  dayDiff,
  epochToDateKey,
  formatDateKey,
  formatDuration,
  formatJalaliDate,
  formatStops,
  formatTime,
  formatThousandToman,
  formatToman,
  formatTomanCompact,
  gregorianToJalali,
  isLeapJalaliYear,
  isValidDateKey,
  jMonthsLength,
  jalaliToGregorian,
  keyFromJalali,
  normalizeForSearch,
  persianWeekdayIndex,
  relativeDayLabel,
  tehranDateTimeToEpoch,
  toEnDigits,
  toFaDigits,
  todayKey,
} from "./persian";

describe("Jalali calendar", () => {
  it.each([
    ["2025-03-21", { jy: 1404, jm: 1, jd: 1 }],
    ["2024-03-20", { jy: 1403, jm: 1, jd: 1 }],
    ["2025-03-20", { jy: 1403, jm: 12, jd: 30 }],
    ["2023-09-23", { jy: 1402, jm: 7, jd: 1 }],
    ["2000-01-01", { jy: 1378, jm: 10, jd: 11 }],
  ])("%s ⇄ %o", (key, jalali) => {
    const [gy, gm, gd] = key.split("-").map(Number);
    expect(gregorianToJalali({ gy, gm, gd })).toEqual(jalali);
    expect(jalaliToGregorian(jalali)).toEqual({ gy, gm, gd });
    expect(keyFromJalali(jalali)).toBe(key);
  });

  it("round-trips every day across several years", () => {
    let key = "2023-01-01";
    for (let i = 0; i < 4 * 366; i++) {
      const [gy, gm, gd] = key.split("-").map(Number);
      expect(keyFromJalali(gregorianToJalali({ gy, gm, gd }))).toBe(key);
      key = addDaysToKey(key, 1);
    }
  });

  it("knows month lengths and leap years", () => {
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(isLeapJalaliYear(1404)).toBe(false);
    expect(jMonthsLength(1403, 12)).toBe(30);
    expect(jMonthsLength(1404, 12)).toBe(29);
    expect(jMonthsLength(1404, 1)).toBe(31);
    expect(jMonthsLength(1404, 7)).toBe(30);
  });

  it("computes the Persian weekday column (Saturday = 0)", () => {
    expect(persianWeekdayIndex({ jy: 1404, jm: 1, jd: 1 })).toBe(6); // Friday 2025-03-21
    expect(formatDateKey("2025-03-21", { weekday: true })).toBe("جمعه ۱ فروردین");
    expect(formatDateKey("2025-03-21")).toBe("۱ فروردین ۱۴۰۴");
  });
});

describe("date keys", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDateKey("2025-02-28")).toBe(true);
    expect(isValidDateKey("2025-02-29")).toBe(false);
    expect(isValidDateKey("2024-02-29")).toBe(true);
    expect(isValidDateKey("2025-2-1")).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });

  it("counts whole days between keys", () => {
    expect(dayDiff("2025-12-30", "2026-01-02")).toBe(3);
    expect(dayDiff("2026-01-02", "2025-12-30")).toBe(-3);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysToKey("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDaysToKey("2025-03-01", -1)).toBe("2025-02-28");
  });
});

describe("Tehran time", () => {
  // 2030-01-01T20:30Z is midnight, Jan 2, in Tehran (UTC+03:30).
  const midnightTehran = Date.parse("2030-01-01T20:30:00Z");

  it("formats wall-clock time in Tehran regardless of the browser zone", () => {
    expect(formatTime(midnightTehran)).toBe("۰۰:۰۰");
    expect(formatTime(midnightTehran - 60_000)).toBe("۲۳:۵۹");
    expect(epochToDateKey(midnightTehran)).toBe("2030-01-02");
    expect(epochToDateKey(midnightTehran - 1)).toBe("2030-01-01");
  });

  it("converts Tehran date + time input to epoch", () => {
    expect(tehranDateTimeToEpoch("2030-01-02", "00:00")).toBe(midnightTehran);
    expect(tehranDateTimeToEpoch("2030-02-30", "00:00")).toBeNull();
    expect(tehranDateTimeToEpoch("2030-01-02", "7:5")).toBeNull();
  });

  it("labels relative days in Tehran", () => {
    const now = Date.parse("2030-01-01T21:00:00Z"); // Jan 2, 00:30 Tehran
    expect(todayKey(now)).toBe("2030-01-02");
    expect(relativeDayLabel("2030-01-02", now)).toBe("امروز");
    expect(relativeDayLabel("2030-01-03", now)).toBe("فردا");
    expect(relativeDayLabel("2030-01-04", now)).toBe("پس‌فردا");
    expect(relativeDayLabel("2030-01-01", now)).toBe("دیروز");
    expect(relativeDayLabel("2030-01-10", now)).toBeNull();
  });

  it("detects next-day arrivals", () => {
    const depart = Date.parse("2030-01-01T19:00:00Z"); // 22:30 Tehran
    expect(arrivalDayOffset(depart, depart + 60 * 60_000)).toBe(0);
    expect(arrivalDayOffset(depart, depart + 120 * 60_000)).toBe(1);
  });

  it("formats Jalali dates of timestamps in Tehran", () => {
    expect(formatJalaliDate(Date.parse("2025-03-20T20:30:00Z"))).toBe("۱ فروردین ۱۴۰۴");
  });
});

describe("number and text formatting", () => {
  it("formats toman with Persian digits and separators", () => {
    expect(formatToman(2_450_000)).toBe("۲٬۴۵۰٬۰۰۰");
    expect(formatToman(999.6)).toBe("۱٬۰۰۰");
    expect(formatTomanCompact(2_500_000)).toBe("۲٫۵ میلیون تومان");
    expect(formatTomanCompact(980_000)).toBe("۹۸۰ هزار تومان");
    expect(formatThousandToman(2_450_000)).toBe("۲٬۴۵۰");
    expect(formatThousandToman(14_500_000)).toBe("۱۴٬۵۰۰");
  });

  it("formats durations and stops", () => {
    expect(formatDuration(95)).toBe("۱ ساعت و ۳۵ دقیقه");
    expect(formatDuration(120)).toBe("۲ ساعت");
    expect(formatDuration(45)).toBe("۴۵ دقیقه");
    expect(formatStops(0)).toBe("مستقیم");
    expect(formatStops(2)).toBe("۲ توقف");
  });

  it("converts digits both ways", () => {
    expect(toFaDigits("12:05")).toBe("۱۲:۰۵");
    expect(toEnDigits("۱۲۳٤٥")).toBe("12345");
  });

  it("normalizes Arabic letters and spacing for search", () => {
    expect(normalizeForSearch("  كيش ")).toBe("کیش");
    expect(normalizeForSearch("Tehran")).toBe("tehran");
    expect(normalizeForSearch("بین‌المللی")).toBe("بینالمللی");
  });
});
