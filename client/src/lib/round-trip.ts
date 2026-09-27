import type { Leg } from "./search-state";

/** Minimum time between landing from the outbound flight and taking off on the return. */
export const MIN_TURNAROUND_MS = 60 * 60_000;

interface Timed {
  departAt: number;
  arriveAt: number;
}

/**
 * Why `candidate` (a flight for `leg`) can't pair with the other leg's selection,
 * or undefined when it can. With nothing chosen on the other leg, anything goes.
 */
export function turnaroundConflict(leg: Leg, candidate: Timed, other: Timed | undefined): string | undefined {
  if (!other) return undefined;
  const [outbound, inbound] = leg === "out" ? [candidate, other] : [other, candidate];
  if (inbound.departAt >= outbound.arriveAt + MIN_TURNAROUND_MS) return undefined;
  if (leg === "out") return "دیرتر از زمان مناسب برای پرواز برگشت انتخابی می‌رسد";
  return inbound.departAt < outbound.arriveAt
    ? "پیش از رسیدن پرواز رفت حرکت می‌کند"
    : "کمتر از یک ساعت پس از رسیدن پرواز رفت";
}
