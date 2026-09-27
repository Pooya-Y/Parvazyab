import { addDaysToKey, formatDateKey, formatPrice, todayKey } from "./persian";
import type { PriceAlert } from "./types";

/** Without dates an alert watches this many days ahead (mirrors the server). */
export const FLEXIBLE_WINDOW_DAYS = 30;

/** How wide "around this date" is, each side. */
export const AROUND_DAYS = 3;

export type AlertScope = "day" | "around" | "any";

/** The date window for a scope around a chosen day; never starts before today. */
export function alertWindow(
  scope: AlertScope,
  date: string | null,
  now = Date.now(),
): { dateFrom?: string; dateTo?: string } {
  if (scope === "any" || !date) return {};
  if (scope === "day") return { dateFrom: date, dateTo: date };
  const today = todayKey(now);
  const from = addDaysToKey(date, -AROUND_DAYS);
  return { dateFrom: from < today ? today : from, dateTo: addDaysToKey(date, AROUND_DAYS) };
}

/** "۴ مهر ۱۴۰۵", "۱ مهر ۱۴۰۵ تا ۷ مهر ۱۴۰۵" or "هر روز تا ۳۰ روز آینده". */
export function alertWindowLabel(alert: Pick<PriceAlert, "dateFrom" | "dateTo">): string {
  if (!alert.dateFrom || !alert.dateTo) return "هر روز تا ۳۰ روز آینده";
  if (alert.dateFrom === alert.dateTo) return formatDateKey(alert.dateFrom);
  return `${formatDateKey(alert.dateFrom)} تا ${formatDateKey(alert.dateTo)}`;
}

/** What makes the alert fire, in words. */
export function alertConditionLabel(alert: Pick<PriceAlert, "targetPrice">): string {
  return alert.targetPrice !== null ? `وقتی کمتر از ${formatPrice(alert.targetPrice)} شد` : "هر کاهش قیمت ۳٪ یا بیشتر";
}

/** Its dates have passed: the server has switched it off, and it can't be resumed. */
export const isExpiredAlert = (alert: Pick<PriceAlert, "dateTo">, now = Date.now()) =>
  alert.dateTo !== null && alert.dateTo < todayKey(now);

/** A friendly suggested target: 10% under the current lowest, rounded down to 10,000 Toman. */
export function suggestTarget(lowest: number | null | undefined): number | null {
  if (!lowest) return null;
  return Math.max(10_000, Math.floor((lowest * 0.9) / 10_000) * 10_000);
}
