import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  cityName,
  formatClockFa,
  formatDateKeyFa,
  formatDurationFa,
  formatTehranTimeFa,
  formatTomanFa,
  iranWeekday,
  placeName,
} from "./format";

describe("Persian formatting", () => {
  test("dates read in the Jalali calendar, and weeks start on Saturday", () => {
    assert.equal(formatDateKeyFa("2026-09-27"), "۵ مهر ۱۴۰۵");
    assert.equal(formatDateKeyFa("2026-09-27", { weekday: true }), "یکشنبه ۵ مهر");
    assert.equal(formatDateKeyFa("2026-10-23", { weekday: true }), "جمعه ۱ آبان");
    assert.equal(iranWeekday("2026-09-26"), 0);
    assert.equal(iranWeekday("2026-10-02"), 6);
  });

  test("durations, clock times and prices", () => {
    assert.equal(formatDurationFa(45), "۴۵ دقیقه");
    assert.equal(formatDurationFa(120), "۲ ساعت");
    assert.equal(formatDurationFa(95), "۱ ساعت و ۳۵ دقیقه");
    assert.equal(formatClockFa(6 * 60 + 5), "۰۶:۰۵");
    // 03:00 UTC is 06:30 in Tehran, whatever the server's time zone.
    assert.equal(formatTehranTimeFa(Date.UTC(2026, 8, 27, 3, 0)), "۰۶:۳۰");
    assert.equal(formatTomanFa(1_770_000), "۱٬۷۷۰٬۰۰۰ تومان");
  });

  test("place names say which Tehran airport, and only there", () => {
    assert.equal(placeName("MHD"), "مشهد");
    assert.equal(placeName("THR"), "تهران (مهرآباد)");
    assert.equal(placeName("IKA"), "تهران (امام خمینی)");
    assert.equal(cityName("THR"), "تهران");
  });
});
