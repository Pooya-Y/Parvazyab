import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeHistory, type HistoryPoint } from "./priceHistory";
import { buildDemoHistory } from "../database/demoSchedule";

const series = (prices: number[]): HistoryPoint[] =>
  prices.map((minPrice, i) => ({ date: `2030-01-${String(i + 1).padStart(2, "0")}`, minPrice, avgPrice: minPrice }));

test("needs a week of history before judging", () => {
  assert.equal(summarizeHistory(series([100, 100, 100])), null);
  assert.ok(summarizeHistory(series([100, 100, 100, 100, 100, 100, 100, 100])));
});

test("compares today with the average of the days before it", () => {
  const below = summarizeHistory(series([100, 100, 100, 100, 100, 100, 100, 90]));
  assert.deepEqual(below, { current: 90, average: 100, low: 90, high: 100, deltaPercent: -10, verdict: "below" });
  assert.equal(summarizeHistory(series([100, 100, 100, 100, 100, 100, 100, 103]))?.verdict, "typical");
  const above = summarizeHistory(series([100, 100, 100, 100, 100, 100, 100, 120]));
  assert.equal(above?.verdict, "above");
  assert.equal(above?.deltaPercent, 20);
});

test("the ±5% band edges are inclusive", () => {
  assert.equal(summarizeHistory(series([100, 100, 100, 100, 100, 100, 100, 95]))?.verdict, "below");
  assert.equal(summarizeHistory(series([100, 100, 100, 100, 100, 100, 100, 105]))?.verdict, "above");
});

test("demo history is deterministic, ends yesterday and stays near the base fare", () => {
  const route = { origin: "THR", destination: "MHD", basePrice: 2_450_000 };
  const a = buildDemoHistory(route, 60, "2030-03-01");
  assert.deepEqual(a, buildDemoHistory(route, 60, "2030-03-01"));
  assert.equal(a.length, 60);
  assert.equal(a[0].date, "2029-12-31");
  assert.equal(a.at(-1)?.date, "2030-02-28");
  for (const p of a) {
    assert.equal(p.minPrice % 10_000, 0);
    assert.ok(p.minPrice > route.basePrice * 0.65 && p.minPrice < route.basePrice * 1.25, `${p.date}: ${p.minPrice}`);
    assert.ok(p.avgPrice >= p.minPrice);
  }
});
