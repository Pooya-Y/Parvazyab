import { isKnownAirport } from "@/domain/airports";
import { isValidDateKey } from "./persian";
import type { SearchParams, SortMode } from "./types";

/**
 * Search state lives in the URL so results survive reloads, the back button and
 * sharing. Filter params are omitted when they have their default value.
 */

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "best", label: "بهترین پیشنهاد" },
  { value: "cheapest", label: "ارزان‌ترین" },
  { value: "fastest", label: "کوتاه‌ترین زمان پرواز" },
  { value: "departure", label: "زودترین حرکت" },
  { value: "arrival", label: "زودترین رسیدن" },
];

/** Departure-time buckets (Tehran time, inclusive hours). */
export const TIME_WINDOWS = [
  { id: "early", label: "بامداد", hint: "۰۰ تا ۰۶", from: 0, to: 5 },
  { id: "morning", label: "صبح", hint: "۰۶ تا ۱۲", from: 6, to: 11 },
  { id: "afternoon", label: "بعدازظهر", hint: "۱۲ تا ۱۸", from: 12, to: 17 },
  { id: "evening", label: "شب", hint: "۱۸ تا ۲۴", from: 18, to: 23 },
] as const;
export type TimeWindowId = (typeof TIME_WINDOWS)[number]["id"];

export interface SearchFiltersState {
  sort: SortMode;
  /** undefined = any number of stops. */
  maxStops?: 0 | 1;
  airlines: string[];
  maxPrice?: number;
  time?: TimeWindowId;
}

export interface SearchState extends SearchFiltersState {
  from: string;
  to: string;
  date?: string;
}

export type RouteProblem = "missing" | "unknown-airport" | "same-airport" | null;

export const DEFAULT_FILTERS: SearchFiltersState = { sort: "best", airlines: [] };

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((s) => s.value));
const TIME_IDS = new Set<string>(TIME_WINDOWS.map((t) => t.id));

export function parseSearchState(params: URLSearchParams): { state: SearchState; problem: RouteProblem } {
  const from = (params.get("from") ?? "").toUpperCase();
  const to = (params.get("to") ?? "").toUpperCase();
  const date = params.get("date");
  const sort = params.get("sort") ?? "";
  const stops = params.get("stops");
  const maxPrice = Number(params.get("maxPrice"));
  const time = params.get("time") ?? "";

  const state: SearchState = {
    from,
    to,
    date: isValidDateKey(date) ? date : undefined,
    sort: SORT_VALUES.has(sort) ? (sort as SortMode) : "best",
    maxStops: stops === "0" ? 0 : stops === "1" ? 1 : undefined,
    airlines: (params.get("airlines") ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    time: TIME_IDS.has(time) ? (time as TimeWindowId) : undefined,
  };

  let problem: RouteProblem = null;
  if (!from || !to) problem = "missing";
  else if (!isKnownAirport(from) || !isKnownAirport(to)) problem = "unknown-airport";
  else if (from === to) problem = "same-airport";
  return { state, problem };
}

export function toSearchParams(s: SearchState): URLSearchParams {
  const p = new URLSearchParams({ from: s.from, to: s.to });
  if (s.date) p.set("date", s.date);
  if (s.sort !== "best") p.set("sort", s.sort);
  if (s.maxStops !== undefined) p.set("stops", String(s.maxStops));
  if (s.airlines.length) p.set("airlines", s.airlines.join(","));
  if (s.maxPrice !== undefined) p.set("maxPrice", String(s.maxPrice));
  if (s.time) p.set("time", s.time);
  return p;
}

export function searchUrl(route: { from: string; to: string; date?: string }): string {
  return `/search?${toSearchParams({ ...DEFAULT_FILTERS, ...route }).toString()}`;
}

export function flightDetailHref(flight: { id: string; originCode: string; destinationCode: string }, date?: string) {
  const params = new URLSearchParams({ from: flight.originCode, to: flight.destinationCode });
  if (date) params.set("date", date);
  return `/flight/${encodeURIComponent(flight.id)}?${params.toString()}`;
}

export function toApiParams(s: SearchState): SearchParams {
  const window = TIME_WINDOWS.find((t) => t.id === s.time);
  return {
    originCode: s.from,
    destinationCode: s.to,
    date: s.date,
    sort: s.sort,
    airlines: s.airlines.length ? s.airlines : undefined,
    maxStops: s.maxStops,
    maxPriceToman: s.maxPrice,
    departFromHour: window?.from,
    departToHour: window?.to,
  };
}

export function activeFilterCount(s: SearchFiltersState): number {
  return (
    (s.maxStops !== undefined ? 1 : 0) +
    (s.airlines.length ? 1 : 0) +
    (s.maxPrice !== undefined ? 1 : 0) +
    (s.time ? 1 : 0)
  );
}
