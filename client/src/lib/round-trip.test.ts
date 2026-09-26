import { describe, expect, it } from "vitest";
import { MIN_TURNAROUND_MS, turnaroundConflict } from "./round-trip";

const H = 3_600_000;
const outbound = { departAt: 10 * H, arriveAt: 12 * H };

describe("turnaroundConflict", () => {
  it("allows anything while the other leg is open", () => {
    expect(turnaroundConflict("ret", { departAt: 0, arriveAt: H }, undefined)).toBeUndefined();
  });

  it("needs an hour on the ground between legs", () => {
    const at = (depart: number) => ({ departAt: depart, arriveAt: depart + 2 * H });
    expect(turnaroundConflict("ret", at(12 * H + MIN_TURNAROUND_MS), outbound)).toBeUndefined();
    expect(turnaroundConflict("ret", at(12 * H + MIN_TURNAROUND_MS - 1), outbound)).toBe(
      "کمتر از یک ساعت پس از رسیدن پرواز رفت",
    );
    expect(turnaroundConflict("ret", at(11 * H), outbound)).toBe("پیش از رسیدن پرواز رفت حرکت می‌کند");
  });

  it("checks outbound candidates against a chosen return", () => {
    const inbound = { departAt: 20 * H, arriveAt: 22 * H };
    expect(turnaroundConflict("out", { departAt: 15 * H, arriveAt: 19 * H }, inbound)).toBeUndefined();
    expect(turnaroundConflict("out", { departAt: 17 * H, arriveAt: 19.5 * H }, inbound)).toMatch(/دیرتر/);
  });
});
