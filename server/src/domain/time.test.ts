import { test } from "node:test";
import assert from "node:assert/strict";
import { tehranDayBounds, tehranHour, tehranWallClock } from "./time";

test("tehranDayBounds covers the Tehran calendar day", () => {
  const bounds = tehranDayBounds("2030-03-21");
  assert.ok(bounds);
  // Midnight Tehran = 20:30 UTC the previous day.
  assert.equal(new Date(bounds[0]).toISOString(), "2030-03-20T20:30:00.000Z");
  assert.equal(bounds[1] - bounds[0], 86_400_000);
});

test("tehranDayBounds rejects malformed and impossible dates", () => {
  assert.equal(tehranDayBounds("2030-02-30"), null);
  assert.equal(tehranDayBounds("2030-13-01"), null);
  assert.equal(tehranDayBounds("30-01-01"), null);
  assert.equal(tehranDayBounds("2030-01-01T00:00"), null);
});

test("tehranHour applies the +03:30 offset", () => {
  assert.equal(tehranHour(Date.parse("2030-01-01T20:29:00Z")), 23);
  assert.equal(tehranHour(Date.parse("2030-01-01T20:30:00Z")), 0);
});

test("tehranWallClock builds a Tehran time relative to today", () => {
  const now = Date.parse("2030-01-01T22:00:00Z"); // already Jan 2, 01:30 in Tehran
  const d = tehranWallClock(1, 6, 30, now);
  assert.equal(d.toISOString(), "2030-01-03T03:00:00.000Z");
});
