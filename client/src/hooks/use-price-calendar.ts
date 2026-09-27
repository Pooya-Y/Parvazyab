import { useMemo } from "react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import type { CalendarDay, SearchParams } from "@/lib/types";

export type CalendarRequest = Omit<SearchParams, "date" | "sort" | "maxPriceToman"> & { start: string; days: number };

export interface PriceCalendarState {
  days: CalendarDay[] | undefined;
  priceByDate: Map<string, number | null> | undefined;
  /** Lowest price in the window (null when nothing flies). */
  cheapest: number | null;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
}

/**
 * Cheapest price per day for a route; pass `null` to skip.
 *
 * `keepPrevious` holds the last result while a new request loads (use it where
 * only filters change, e.g. the results date strip). Without it, data from a
 * previous request is never shown — so a picker can't show another route's prices.
 */
export function usePriceCalendar(
  request: CalendarRequest | null,
  { keepPrevious = false }: { keepPrevious?: boolean } = {},
): PriceCalendarState {
  const key = request ? `calendar:${JSON.stringify(request)}` : null;
  const query = useApiQuery(key, (signal) => api.priceCalendar(request!, signal));
  const current = keepPrevious || query.dataKey === key ? query.data : undefined;

  return useMemo(() => {
    const days = current?.days;
    const prices = days?.map((d) => d.minPrice).filter((p): p is number => p !== null) ?? [];
    return {
      days,
      priceByDate: days ? new Map(days.map((d) => [d.date, d.minPrice])) : undefined,
      cheapest: prices.length ? Math.min(...prices) : null,
      isLoading: key !== null && !current && !query.error,
      isFetching: query.isFetching,
      error: query.error,
    };
  }, [current, key, query.error, query.isFetching]);
}
