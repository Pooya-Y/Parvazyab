import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { gregorianToJalaliKey, isJalaliYear, jalaliToGregorianKey } from "./jalali";

describe("Jalali dates", () => {
  test("converts known dates both ways", () => {
    const pairs: [string, [number, number, number]][] = [
      ["2026-09-26", [1405, 7, 4]],
      ["2026-03-21", [1405, 1, 1]], // Nowruz
      ["2025-03-20", [1403, 12, 30]], // last day of a leap year
      ["2024-03-19", [1402, 12, 29]],
      ["2000-01-01", [1378, 10, 11]],
    ];
    for (const [gregorian, [jy, jm, jd]] of pairs) {
      assert.equal(jalaliToGregorianKey(jy, jm, jd), gregorian, `${jy}-${jm}-${jd}`);
      assert.equal(
        gregorianToJalaliKey(gregorian),
        `${jy}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`,
      );
    }
  });

  test("rejects days that don't exist", () => {
    assert.equal(jalaliToGregorianKey(1404, 12, 30), null, "1404 is not a leap year");
    assert.equal(jalaliToGregorianKey(1405, 7, 31), null, "Mehr has 30 days");
    assert.equal(jalaliToGregorianKey(1405, 13, 1), null);
    assert.equal(jalaliToGregorianKey(1405, 0, 10), null);
  });

  test("tells Jalali years from Gregorian ones", () => {
    assert.equal(isJalaliYear(1405), true);
    assert.equal(isJalaliYear(2026), false);
  });
});
