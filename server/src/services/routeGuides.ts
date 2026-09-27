/**
 * Route guides: the data behind the server-rendered /flights pages that search
 * engines index. Built from the same visible listings, flight grouping and
 * caches as search, so a guide never quotes a price the search page can't show.
 */
import { AppDataSource } from "../database/dataSource";
import { findAirport } from "../domain/airports";
import { addDaysToDateKey, tehranDayBounds, tehranHour, tehranTodayKey, TEHRAN_OFFSET_MS } from "../domain/time";
import type { AgencyRating, FlightCard } from "./flightsCore";
import { loadRouteFlights, SEARCH_CACHE_PREFIX } from "./flightService";
import { routePriceHistory, type HistorySummary } from "./priceHistory";
import { cached } from "./redis";
import { VISIBLE_LISTING_SQL } from "./visibility";

/** Guides cover this many Tehran calendar days, today included. */
export const GUIDE_DAYS = 30;
/** "Cheapest flights this week" looks this far ahead. */
const UPCOMING_DAYS = 7;
const UPCOMING_LIMIT = 6;
const AGENCY_LIMIT = 12;
const RELATED_LIMIT = 8;
/** The price trend compares today with this many days of snapshots. */
const TREND_DAYS = 60;
const DIRECTORY_TTL_SECONDS = 300;
const GUIDE_TTL_SECONDS = 120;

/** Departure-time buckets, the same as the search page's time filter (Tehran hours, inclusive). */
export const DAY_PARTS = [
  { id: "early", from: 0, to: 5 },
  { id: "morning", from: 6, to: 11 },
  { id: "afternoon", from: 12, to: 17 },
  { id: "evening", from: 18, to: 23 },
] as const;
export type DayPart = (typeof DAY_PARTS)[number]["id"];

export interface RouteSummary {
  originCode: string;
  destinationCode: string;
  minPrice: number;
  /** Distinct real flights in the guide window. */
  flights: number;
}

export interface GuideDay {
  date: string;
  /** Lowest price that day, or null when nothing flies. */
  minPrice: number | null;
  flights: number;
}

export interface GuideFlight {
  id: string;
  date: string;
  departAt: number;
  arriveAt: number;
  airline: string;
  flightNo: string;
  durationMin: number;
  stops: number;
  price: number;
  /** Agencies selling it. */
  agencies: number;
}

export interface GuideAirline {
  name: string;
  flights: number;
  minPrice: number;
}

export interface GuideAgency {
  name: string;
  slug: string | null;
  verified: boolean;
  rating: AgencyRating | null;
  /** Flights it sells in the window. */
  flights: number;
  minPrice: number;
}

export interface RouteGuide {
  originCode: string;
  destinationCode: string;
  generatedAt: number;
  days: GuideDay[];
  cheapest: { date: string; price: number } | null;
  flights: number;
  directFlights: number;
  /** Flights with at least one charter fare. */
  charterFlights: number;
  /** Minutes; direct flights only when the route has any. */
  duration: { shortest: number; typical: number } | null;
  /** Minutes after midnight (Tehran) of the earliest and latest departures, and flights per part of the day. */
  departures: { earliest: number; latest: number; parts: Record<DayPart, number> } | null;
  airlines: GuideAirline[];
  agencies: GuideAgency[];
  upcoming: GuideFlight[];
  trend: HistorySummary | null;
  related: { reverse: RouteSummary | null; fromOrigin: RouteSummary[]; toDestination: RouteSummary[] };
}

/** Start of the first Tehran day after the window. */
function windowEnd(today: string): number {
  return tehranDayBounds(addDaysToDateKey(today, GUIDE_DAYS))![0];
}

const tehranDateKey = (epochMs: number) => new Date(epochMs + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);

function tehranMinuteOfDay(epochMs: number): number {
  const d = new Date(epochMs + TEHRAN_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Every route with a bookable flight in the guide window, busiest first. */
export function routeDirectory(now = Date.now()): Promise<RouteSummary[]> {
  const today = tehranTodayKey(now);
  return cached(`${SEARCH_CACHE_PREFIX}guides:routes:${today}`, DIRECTORY_TTL_SECONDS, async () => {
    const rows = (await AppDataSource.query(
      `SELECT f.origin_code, f.destination_code, min(f.price_toman) AS min_price,
              count(DISTINCT f.airline || '|' || f.flight_no || '|' || date_trunc('minute', f.depart_at)) AS flights
         FROM flight_listings f
        WHERE ${VISIBLE_LISTING_SQL}
          AND f.depart_at < $1
        GROUP BY f.origin_code, f.destination_code`,
      [new Date(windowEnd(today))],
    )) as { origin_code: string; destination_code: string; min_price: string; flights: string }[];
    return rows
      .filter(
        (r) => r.origin_code !== r.destination_code && findAirport(r.origin_code) && findAirport(r.destination_code),
      )
      .map((r) => ({
        originCode: r.origin_code,
        destinationCode: r.destination_code,
        minPrice: Number(r.min_price),
        flights: Number(r.flights),
      }))
      .sort(
        (a, b) =>
          b.flights - a.flights ||
          a.minPrice - b.minPrice ||
          `${a.originCode}${a.destinationCode}`.localeCompare(`${b.originCode}${b.destinationCode}`),
      );
  });
}

export interface GuideInput {
  originCode: string;
  destinationCode: string;
  /** The route's upcoming flights; only those inside the window are used. */
  cards: FlightCard[];
  directory: RouteSummary[];
  trend: HistorySummary | null;
  now: number;
}

/** The guide for a route, from data already loaded. Pure, so it's tested without a database. */
export function buildGuide({ originCode, destinationCode, cards, directory, trend, now }: GuideInput): RouteGuide {
  const today = tehranTodayKey(now);
  const end = windowEnd(today);
  const flights = cards.filter((f) => f.departAt > now && f.departAt < end);

  const byDay = new Map<string, { minPrice: number; flights: number }>();
  for (const f of flights) {
    const day = byDay.get(tehranDateKey(f.departAt));
    if (day) {
      day.minPrice = Math.min(day.minPrice, f.bestPriceToman);
      day.flights++;
    } else {
      byDay.set(tehranDateKey(f.departAt), { minPrice: f.bestPriceToman, flights: 1 });
    }
  }
  const days: GuideDay[] = Array.from({ length: GUIDE_DAYS }, (_, i) => {
    const date = addDaysToDateKey(today, i);
    const day = byDay.get(date);
    return { date, minPrice: day?.minPrice ?? null, flights: day?.flights ?? 0 };
  });
  let cheapest: RouteGuide["cheapest"] = null;
  for (const d of days) {
    if (d.minPrice !== null && (!cheapest || d.minPrice < cheapest.price))
      cheapest = { date: d.date, price: d.minPrice };
  }

  const direct = flights.filter((f) => f.stops === 0);
  const durations = (direct.length ? direct : flights).map((f) => f.durationMin).sort((a, b) => a - b);

  let departures: RouteGuide["departures"] = null;
  if (flights.length) {
    const minutes = flights.map((f) => tehranMinuteOfDay(f.departAt));
    const parts = Object.fromEntries(DAY_PARTS.map((p) => [p.id, 0])) as Record<DayPart, number>;
    for (const f of flights) {
      const hour = tehranHour(f.departAt);
      parts[DAY_PARTS.find((p) => hour >= p.from && hour <= p.to)!.id]++;
    }
    departures = { earliest: Math.min(...minutes), latest: Math.max(...minutes), parts };
  }

  const airlines = new Map<string, GuideAirline>();
  for (const f of flights) {
    const a = airlines.get(f.airline);
    if (a) {
      a.flights++;
      a.minPrice = Math.min(a.minPrice, f.bestPriceToman);
    } else {
      airlines.set(f.airline, { name: f.airline, flights: 1, minPrice: f.bestPriceToman });
    }
  }

  const agencies = new Map<string, GuideAgency>();
  for (const f of flights) {
    const cheapestByAgency = new Map<string, number>();
    for (const o of f.offers) {
      cheapestByAgency.set(o.agencyId, Math.min(cheapestByAgency.get(o.agencyId) ?? Infinity, o.priceToman));
    }
    for (const [agencyId, price] of cheapestByAgency) {
      const a = agencies.get(agencyId);
      if (a) {
        a.flights++;
        a.minPrice = Math.min(a.minPrice, price);
        continue;
      }
      const offer = f.offers.find((o) => o.agencyId === agencyId)!;
      agencies.set(agencyId, {
        name: offer.agencyName,
        slug: offer.agencySlug ?? null,
        verified: offer.agencyVerified ?? false,
        rating: offer.agencyRating ?? null,
        flights: 1,
        minPrice: price,
      });
    }
  }

  const upcomingEnd = tehranDayBounds(addDaysToDateKey(today, UPCOMING_DAYS))![0];
  const upcoming = flights
    .filter((f) => f.departAt < upcomingEnd)
    .sort((a, b) => a.bestPriceToman - b.bestPriceToman || a.departAt - b.departAt)
    .slice(0, UPCOMING_LIMIT)
    .map((f) => ({
      id: f.id,
      date: tehranDateKey(f.departAt),
      departAt: f.departAt,
      arriveAt: f.arriveAt,
      airline: f.airline,
      flightNo: f.flightNo,
      durationMin: f.durationMin,
      stops: f.stops,
      price: f.bestPriceToman,
      agencies: f.agencyCount,
    }));

  const byBusiest = (a: { flights: number; minPrice: number }, b: { flights: number; minPrice: number }) =>
    b.flights - a.flights || a.minPrice - b.minPrice;

  return {
    originCode,
    destinationCode,
    generatedAt: now,
    days,
    cheapest,
    flights: flights.length,
    directFlights: direct.length,
    charterFlights: flights.filter((f) => f.offers.some((o) => o.fareType === "charter")).length,
    duration: durations.length ? { shortest: durations[0], typical: median(durations) } : null,
    departures,
    airlines: [...airlines.values()].sort(byBusiest),
    agencies: [...agencies.values()].sort(byBusiest).slice(0, AGENCY_LIMIT),
    upcoming,
    trend,
    related: {
      reverse: directory.find((r) => r.originCode === destinationCode && r.destinationCode === originCode) ?? null,
      fromOrigin: directory
        .filter((r) => r.originCode === originCode && r.destinationCode !== destinationCode)
        .slice(0, RELATED_LIMIT),
      toDestination: directory
        .filter((r) => r.destinationCode === destinationCode && r.originCode !== originCode)
        .slice(0, RELATED_LIMIT),
    },
  };
}

export function routeGuide(originCode: string, destinationCode: string, now = Date.now()): Promise<RouteGuide> {
  const key = `${SEARCH_CACHE_PREFIX}guides:${originCode}:${destinationCode}:${tehranTodayKey(now)}`;
  return cached(key, GUIDE_TTL_SECONDS, async () => {
    const [cards, directory, history] = await Promise.all([
      loadRouteFlights(originCode, destinationCode),
      routeDirectory(now),
      routePriceHistory(originCode, destinationCode, TREND_DAYS, now),
    ]);
    return buildGuide({ originCode, destinationCode, cards, directory, trend: history.summary, now });
  });
}
