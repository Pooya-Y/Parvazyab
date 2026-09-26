/** Axis helpers for the small charts (pure, so they're easy to test). */

const STEPS = [1, 2, 2.5, 5, 10];

/** A "nice" step (1, 2, 2.5 or 5 × 10ⁿ) giving roughly `target` intervals over `range`. */
export function niceStep(range: number, target = 4): number {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = STEPS.find((s) => s * magnitude >= raw) ?? 10;
  return step * magnitude;
}

/**
 * Round tick values covering [min, max] with a little headroom, plus the domain
 * they span. A flat series still gets a visible band around its value.
 */
export function valueTicks(min: number, max: number, target = 4): { ticks: number[]; lo: number; hi: number } {
  const pad = max === min ? Math.max(Math.abs(max) * 0.05, 1) : (max - min) * 0.08;
  const step = niceStep(max - min + 2 * pad, target);
  const lo = Math.floor((min - pad) / step) * step;
  const hi = Math.ceil((max + pad) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, lo, hi };
}

/** `count` evenly spread indices over `length` items, always including both ends. */
export function spreadIndices(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (length - 1)) / (count - 1)));
}
