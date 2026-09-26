import { describe, expect, it } from "vitest";
import { niceStep, spreadIndices, valueTicks } from "./chart-scale";

describe("chart scales", () => {
  it("picks round steps", () => {
    expect(niceStep(1_000_000, 4)).toBe(250_000);
    expect(niceStep(430_000, 4)).toBe(200_000);
    expect(niceStep(9, 4)).toBe(2.5);
    expect(niceStep(0)).toBe(1);
  });

  it("covers the data with round ticks and headroom", () => {
    const { ticks, lo, hi } = valueTicks(1_710_000, 2_120_000);
    expect(lo).toBeLessThan(1_710_000);
    expect(hi).toBeGreaterThan(2_120_000);
    expect(ticks[0]).toBe(lo);
    expect(ticks.at(-1)).toBe(hi);
    const steps = new Set(ticks.slice(1).map((t, i) => t - ticks[i]));
    expect(steps.size).toBe(1);
    expect(ticks.every((t) => t % 50_000 === 0)).toBe(true);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(7);
  });

  it("gives a flat series a visible band", () => {
    const { lo, hi } = valueTicks(2_000_000, 2_000_000);
    expect(lo).toBeLessThan(2_000_000);
    expect(hi).toBeGreaterThan(2_000_000);
  });

  it("spreads label indices and keeps both ends", () => {
    expect(spreadIndices(60, 4)).toEqual([0, 20, 39, 59]);
    expect(spreadIndices(3, 4)).toEqual([0, 1, 2]);
    expect(spreadIndices(0, 4)).toEqual([]);
  });
});
