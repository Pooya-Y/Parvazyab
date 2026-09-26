/**
 * Cheapest price per Iran calendar day for a route: powers the date picker's
 * prices and the results page's date strip. One aggregate query, honouring the
 * same filters as search so the two never contradict each other.
 */
import { flightListings } from "../database/dataSource";
import { addDaysToDateKey, tehranDayBounds, tehranWallClockSql } from "../domain/time";
import type { CalendarQuery } from "../api/schemas";
import { cached } from "./redis";
import { SEARCH_CACHE_PREFIX } from "./flightService";
import { VISIBLE_LISTING_SQL } from "./visibility";

export interface CalendarDay {
  date: string;
  /** Lowest price that day, or null when nothing flies. */
  minPrice: number | null;
  /** Distinct real flights that day. */
  flights: number;
}

export interface PriceCalendar {
  start: string;
  days: CalendarDay[];
}

const CALENDAR_TTL_SECONDS = 60;

interface SqlQuery {
  text: string;
  params: unknown[];
}

/** Inclusive Tehran-hour window on a timestamptz column; windows like 22→4 wrap midnight. */
function hourWindow(column: string, from: number, to: number, params: unknown[]): string {
  const hour = `EXTRACT(HOUR FROM ${tehranWallClockSql(column)})`;
  params.push(from, to);
  const a = `$${params.length - 1}`;
  const b = `$${params.length}`;
  return from <= to ? `${hour} BETWEEN ${a} AND ${b}` : `(${hour} >= ${a} OR ${hour} <= ${b})`;
}

export function buildCalendarSql(q: CalendarQuery): SqlQuery {
  const bounds = tehranDayBounds(q.start);
  if (!bounds) throw new Error(`invalid calendar start ${q.start}`);
  const params: unknown[] = [
    q.originCode,
    q.destinationCode,
    new Date(bounds[0]),
    new Date(bounds[0] + q.days * 86_400_000),
  ];
  const where = [
    "f.origin_code = $1",
    "f.destination_code = $2",
    "f.depart_at >= $3",
    "f.depart_at < $4",
    VISIBLE_LISTING_SQL,
  ];
  if (q.cabin) where.push(`f.cabin = $${params.push(q.cabin)}`);
  if (q.fareType) where.push(`f.fare_type = $${params.push(q.fareType)}`);
  if (q.directOnly) where.push("f.stops = 0");
  if (q.maxStops !== undefined) where.push(`f.stops <= $${params.push(q.maxStops)}`);
  if (q.airlines?.length) where.push(`f.airline = ANY($${params.push(q.airlines)})`);
  if (q.departFromHour !== undefined && q.departToHour !== undefined) {
    where.push(hourWindow("f.depart_at", q.departFromHour, q.departToHour, params));
  }
  if (q.arriveFromHour !== undefined && q.arriveToHour !== undefined) {
    where.push(hourWindow("f.arrive_at", q.arriveFromHour, q.arriveToHour, params));
  }
  const day = `to_char(${tehranWallClockSql("f.depart_at")}, 'YYYY-MM-DD')`;
  return {
    text: `SELECT ${day} AS day,
                  min(f.price_toman) AS min_price,
                  count(DISTINCT f.airline || '|' || f.flight_no || '|' || date_trunc('minute', f.depart_at)) AS flights
             FROM flight_listings f
            WHERE ${where.join("\n              AND ")}
            GROUP BY 1`,
    params,
  };
}

/** Every day of the window, filling days without flights with nulls. */
export function fillCalendar(
  start: string,
  days: number,
  rows: { day: string; min_price: string | number; flights: string | number }[],
): CalendarDay[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDaysToDateKey(start, i);
    const row = byDay.get(date);
    return { date, minPrice: row ? Number(row.min_price) : null, flights: row ? Number(row.flights) : 0 };
  });
}

export function priceCalendar(q: CalendarQuery): Promise<PriceCalendar> {
  const key = `${SEARCH_CACHE_PREFIX}cal:${JSON.stringify(q)}`;
  return cached(key, CALENDAR_TTL_SECONDS, async () => {
    const { text, params } = buildCalendarSql(q);
    const rows = (await flightListings().query(text, params)) as {
      day: string;
      min_price: string;
      flights: string;
    }[];
    return { start: q.start, days: fillCalendar(q.start, q.days, rows) };
  });
}
