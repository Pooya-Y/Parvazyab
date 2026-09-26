import { isKnownAirport } from "@/domain/airports";
import { isValidDateKey } from "./persian";
import type { Cabin, FareType, SearchParams, SortMode } from "./types";

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

export const CABIN_OPTIONS: { value: Cabin; label: string }[] = [
  { value: "economy", label: "اکونومی" },
  { value: "business", label: "بیزینس" },
];

export const FARE_TYPE_OPTIONS: { value: FareType; label: string }[] = [
  { value: "scheduled", label: "سیستمی" },
  { value: "charter", label: "چارتری" },
];

/** Departure/arrival time buckets (Tehran time, inclusive hours). */
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
  cabin?: Cabin;
  fareType?: FareType;
  /** Departure time window. */
  time?: TimeWindowId;
  /** Arrival time window. */
  arrive?: TimeWindowId;
}

/** Round trips pick an outbound ("out") then a return ("ret") flight. */
export type Leg = "out" | "ret";

export interface SearchState extends SearchFiltersState {
  from: string;
  to: string;
  date?: string;
  /** Return date; its presence makes the search a round trip. */
  ret?: string;
  /** Selected outbound / return flight ids (round trip). */
  outboundId?: string;
  returnId?: string;
  /** Leg being chosen; derived from the selections when absent. */
  leg?: Leg;
  /** The return leg's own time windows (`time`/`arrive` belong to the outbound leg). */
  returnTime?: TimeWindowId;
  returnArrive?: TimeWindowId;
}

export type RouteProblem = "missing" | "unknown-airport" | "same-airport" | null;

export const DEFAULT_FILTERS: SearchFiltersState = { sort: "best", airlines: [] };

/** Every filter reset explicitly (undefined keys matter when merged into URL state). */
export const CLEARED_FILTERS: Omit<SearchFiltersState, "sort"> = {
  maxStops: undefined,
  airlines: [],
  maxPrice: undefined,
  cabin: undefined,
  fareType: undefined,
  time: undefined,
  arrive: undefined,
};

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((s) => s.value));
const TIME_IDS = new Set<string>(TIME_WINDOWS.map((t) => t.id));
const CABINS = new Set<string>(CABIN_OPTIONS.map((c) => c.value));
const FARE_TYPES = new Set<string>(FARE_TYPE_OPTIONS.map((f) => f.value));

const timeWindow = (value: string | null) => (value && TIME_IDS.has(value) ? (value as TimeWindowId) : undefined);
const flightId = (value: string | null) => (value && value.length <= 255 ? value : undefined);

export function parseSearchState(params: URLSearchParams): { state: SearchState; problem: RouteProblem } {
  const from = (params.get("from") ?? "").toUpperCase();
  const to = (params.get("to") ?? "").toUpperCase();
  const date = params.get("date");
  const sort = params.get("sort") ?? "";
  const stops = params.get("stops");
  const maxPrice = Number(params.get("maxPrice"));
  const cabin = params.get("cabin") ?? "";
  const fare = params.get("fare") ?? "";

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
    cabin: CABINS.has(cabin) ? (cabin as Cabin) : undefined,
    fareType: FARE_TYPES.has(fare) ? (fare as FareType) : undefined,
    time: timeWindow(params.get("time")),
    arrive: timeWindow(params.get("arrive")),
  };

  // A return date only counts on or after a valid outbound date.
  const ret = params.get("ret");
  if (state.date && isValidDateKey(ret) && ret >= state.date) {
    const leg = params.get("leg");
    Object.assign(state, {
      ret,
      outboundId: flightId(params.get("ob")),
      returnId: flightId(params.get("rb")),
      leg: leg === "out" || leg === "ret" ? leg : undefined,
      returnTime: timeWindow(params.get("rtime")),
      returnArrive: timeWindow(params.get("rarrive")),
    } satisfies Partial<SearchState>);
  }

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
  if (s.cabin) p.set("cabin", s.cabin);
  if (s.fareType) p.set("fare", s.fareType);
  if (s.time) p.set("time", s.time);
  if (s.arrive) p.set("arrive", s.arrive);
  if (s.ret && s.date) {
    p.set("ret", s.ret);
    if (s.returnTime) p.set("rtime", s.returnTime);
    if (s.returnArrive) p.set("rarrive", s.returnArrive);
    if (s.outboundId) p.set("ob", s.outboundId);
    if (s.returnId) p.set("rb", s.returnId);
    if (s.leg) p.set("leg", s.leg);
  }
  return p;
}

export function isRoundTrip(s: SearchState): s is SearchState & { date: string; ret: string } {
  return Boolean(s.ret && s.date);
}

/** The leg being chosen: explicit `leg`, else outbound until it's picked. */
export function activeLeg(s: SearchState): Leg {
  if (!isRoundTrip(s)) return "out";
  return s.leg ?? (s.outboundId ? "ret" : "out");
}

/** Route and date a leg searches (the return leg runs the route backwards on the return date). */
export function legRoute(s: SearchState, leg: Leg): { from: string; to: string; date?: string } {
  return leg === "ret" && isRoundTrip(s)
    ? { from: s.to, to: s.from, date: s.ret }
    : { from: s.from, to: s.to, date: s.date };
}

/** Filters as seen by one leg: shared filters plus that leg's own time windows. */
export function legFilters(s: SearchState, leg: Leg): SearchFiltersState {
  return leg === "ret" ? { ...s, time: s.returnTime, arrive: s.returnArrive } : s;
}

/** Map a filter change made while viewing `leg` onto URL state (time windows are per leg). */
export function legPatch(leg: Leg, patch: Partial<SearchFiltersState>): Partial<SearchState> {
  if (leg === "out") return patch;
  const { time, arrive, ...shared } = patch;
  const mapped: Partial<SearchState> = { ...shared };
  if ("time" in patch) mapped.returnTime = time;
  if ("arrive" in patch) mapped.returnArrive = arrive;
  return mapped;
}

export function searchUrl(route: { from: string; to: string; date?: string; ret?: string }): string {
  return `/search?${toSearchParams({ ...DEFAULT_FILTERS, ...route }).toString()}`;
}

export function flightDetailHref(flight: { id: string; originCode: string; destinationCode: string }, date?: string) {
  const params = new URLSearchParams({ from: flight.originCode, to: flight.destinationCode });
  if (date) params.set("date", date);
  return `/flight/${encodeURIComponent(flight.id)}?${params.toString()}`;
}

export function toApiParams(state: SearchState, leg: Leg = "out"): SearchParams {
  const route = legRoute(state, leg);
  const s = legFilters(state, leg);
  const depart = TIME_WINDOWS.find((t) => t.id === s.time);
  const arrive = TIME_WINDOWS.find((t) => t.id === s.arrive);
  return {
    originCode: route.from,
    destinationCode: route.to,
    date: route.date,
    sort: s.sort,
    airlines: s.airlines.length ? s.airlines : undefined,
    maxStops: s.maxStops,
    maxPriceToman: s.maxPrice,
    cabin: s.cabin,
    fareType: s.fareType,
    departFromHour: depart?.from,
    departToHour: depart?.to,
    arriveFromHour: arrive?.from,
    arriveToHour: arrive?.to,
  };
}

export function activeFilterCount(s: SearchFiltersState): number {
  return (
    (s.maxStops !== undefined ? 1 : 0) +
    (s.airlines.length ? 1 : 0) +
    (s.maxPrice !== undefined ? 1 : 0) +
    (s.cabin ? 1 : 0) +
    (s.fareType ? 1 : 0) +
    (s.time ? 1 : 0) +
    (s.arrive ? 1 : 0)
  );
}
