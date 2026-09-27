import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_TEMPLATES, buildDemoSchedule, unitHash } from "./demoSchedule";
import { TEHRAN_OFFSET_MS } from "../domain/time";

const NOW = Date.parse("2030-01-01T06:00:00Z"); // 09:30 Tehran, a Tuesday

test("the schedule is deterministic", () => {
  assert.deepEqual(buildDemoSchedule(7, NOW), buildDemoSchedule(7, NOW));
});

test("only future departures inside the window", () => {
  const specs = buildDemoSchedule(14, NOW);
  assert.ok(specs.length > 100);
  const horizon = NOW + 15 * 86_400_000;
  for (const s of specs) {
    assert.ok(s.departAt.getTime() > NOW, `${s.flightNo} departs in the future`);
    assert.ok(s.departAt.getTime() < horizon);
  }
  // 06:30 Tehran today has already left at 09:30.
  const todayKey = new Date(NOW + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
  assert.ok(
    !specs.some(
      (s) =>
        s.flightNo === "W5-101" && new Date(s.departAt.getTime() + TEHRAN_OFFSET_MS).toISOString().startsWith(todayKey),
    ),
  );
});

test("weekday-restricted flights only operate on their days", () => {
  const izWeekdays = new Set(
    buildDemoSchedule(14, NOW)
      .filter((s) => s.flightNo === "IZ-404")
      .map((s) => (new Date(s.departAt.getTime() + TEHRAN_OFFSET_MS).getUTCDay() + 1) % 7),
  );
  assert.deepEqual([...izWeekdays].sort(), [0, 2, 4]);
});

test("prices are rounded and stay near the template base", () => {
  for (const s of buildDemoSchedule(14, NOW)) {
    assert.equal(s.priceToman % 10_000, 0);
    const template = DEMO_TEMPLATES.find((t) => t.flightNo === s.flightNo && (t.cabin ?? "economy") === s.cabin)!;
    assert.ok(s.priceToman > template.basePrice * 0.75 && s.priceToman < template.basePrice * 1.45, s.flightNo);
  }
});

test("each seller of a multi-agency flight gets its own offer", () => {
  const firstDay = buildDemoSchedule(14, NOW).filter((s) => s.flightNo === "W5-102");
  const byTime = new Map<number, Set<number>>();
  for (const s of firstDay) {
    const set = byTime.get(s.departAt.getTime()) ?? new Set();
    set.add(s.sellerIndex);
    byTime.set(s.departAt.getTime(), set);
  }
  for (const sellers of byTime.values()) assert.deepEqual([...sellers].sort(), [0, 1]);
});

test("unitHash is stable and within [0, 1)", () => {
  assert.equal(unitHash("W5-101|2030-01-01"), unitHash("W5-101|2030-01-01"));
  for (const k of ["a", "b", "THR-MHD", ""]) {
    const v = unitHash(k);
    assert.ok(v >= 0 && v < 1);
  }
});
