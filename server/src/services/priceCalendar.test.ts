import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendarSql, fillCalendar } from "./priceCalendar";
import type { CalendarQuery } from "../api/schemas";

const base: CalendarQuery = { originCode: "THR", destinationCode: "MHD", start: "2030-01-10", days: 7 };

test("calendar window spans whole Tehran days", () => {
  const { params } = buildCalendarSql(base);
  assert.equal((params[2] as Date).toISOString(), "2030-01-09T20:30:00.000Z");
  assert.equal((params[3] as Date).toISOString(), "2030-01-16T20:30:00.000Z");
});

test("every filter becomes a numbered parameter, never inlined", () => {
  const { text, params } = buildCalendarSql({
    ...base,
    cabin: "business",
    fareType: "charter",
    maxStops: 1,
    airlines: ["ماهان ایر", "x' OR 1=1 --"],
    departFromHour: 6,
    departToHour: 11,
    arriveFromHour: 22,
    arriveToHour: 4,
  });
  assert.deepEqual(params.slice(4), ["business", "charter", 1, ["ماهان ایر", "x' OR 1=1 --"], 6, 11, 22, 4]);
  for (let i = 1; i <= params.length; i++) assert.ok(text.includes(`$${i}`), `$${i} used`);
  assert.ok(!text.includes("OR 1=1"));
  // The arrival window wraps midnight.
  assert.match(text, />= \$11 OR .* <= \$12/);
});

test("unfiltered query has only the route and window parameters", () => {
  assert.equal(buildCalendarSql(base).params.length, 4);
});

test("fillCalendar returns every day with nulls for empty ones", () => {
  const days = fillCalendar("2030-01-30", 4, [
    { day: "2030-01-31", min_price: "2450000", flights: "3" },
    { day: "2030-02-02", min_price: 1_990_000, flights: 1 },
  ]);
  assert.deepEqual(days, [
    { date: "2030-01-30", minPrice: null, flights: 0 },
    { date: "2030-01-31", minPrice: 2_450_000, flights: 3 },
    { date: "2030-02-01", minPrice: null, flights: 0 },
    { date: "2030-02-02", minPrice: 1_990_000, flights: 1 },
  ]);
});
