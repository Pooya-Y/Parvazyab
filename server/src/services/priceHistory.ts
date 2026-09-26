/**
 * Route price trends: the worker snapshots the lowest economy fare per route once
 * per Tehran day; the API serves the series plus a "is today cheap?" verdict.
 */
import { AppDataSource } from "../database/dataSource";
import { addDaysToDateKey, tehranTodayKey } from "../domain/time";
import { cached } from "./redis";
import { SEARCH_CACHE_PREFIX } from "./flightService";
import { VISIBLE_LISTING_SQL } from "./visibility";

/** Only flights departing this soon count towards a day's snapshot. */
export const SNAPSHOT_HORIZON_DAYS = 30;
const HISTORY_TTL_SECONDS = 600;
/** Within ±5% of the average reads as "typical". */
const TYPICAL_BAND = 0.05;

// Economy only, so occasional business listings don't distort the trend.
const SNAPSHOT_SELECT = `
  SELECT f.origin_code, f.destination_code,
         min(f.price_toman) AS min_price, round(avg(f.price_toman)) AS avg_price, count(*) AS offer_count
    FROM flight_listings f
   WHERE ${VISIBLE_LISTING_SQL}
     AND f.cabin = 'economy'
     AND f.depart_at < now() + interval '${SNAPSHOT_HORIZON_DAYS} days'`;

/** Upsert today's snapshot for every route with bookable flights. Returns the number of routes. */
export async function snapshotRoutePrices(now = Date.now()): Promise<number> {
  const rows = (await AppDataSource.query(
    `INSERT INTO route_price_snapshots (origin_code, destination_code, snapshot_date, min_price, avg_price, offer_count, updated_at)
     SELECT s.origin_code, s.destination_code, $1::date, s.min_price, s.avg_price, s.offer_count, now()
       FROM (${SNAPSHOT_SELECT} GROUP BY f.origin_code, f.destination_code) s
     ON CONFLICT (origin_code, destination_code, snapshot_date) DO UPDATE
       SET min_price = EXCLUDED.min_price, avg_price = EXCLUDED.avg_price,
           offer_count = EXCLUDED.offer_count, updated_at = now()
     RETURNING 1`,
    [tehranTodayKey(now)],
  )) as unknown[];
  return rows.length;
}

export interface HistoryPoint {
  date: string;
  minPrice: number;
  avgPrice: number;
}

export type Verdict = "below" | "typical" | "above";

export interface HistorySummary {
  current: number;
  average: number;
  low: number;
  high: number;
  /** (current − average) / average, rounded to a whole percent. */
  deltaPercent: number;
  verdict: Verdict;
}

export interface PriceHistory {
  originCode: string;
  destinationCode: string;
  points: HistoryPoint[];
  /** Null when there isn't enough history for a fair comparison. */
  summary: HistorySummary | null;
}

/** Compare the latest point with the ones before it. Needs a week of history to say anything. */
export function summarizeHistory(points: HistoryPoint[]): HistorySummary | null {
  if (points.length < 8) return null;
  const current = points[points.length - 1].minPrice;
  const past = points.slice(0, -1).map((p) => p.minPrice);
  const average = Math.round(past.reduce((a, b) => a + b, 0) / past.length);
  const delta = (current - average) / average;
  return {
    current,
    average,
    low: Math.min(...past, current),
    high: Math.max(...past, current),
    deltaPercent: Math.round(delta * 100),
    verdict: delta <= -TYPICAL_BAND ? "below" : delta >= TYPICAL_BAND ? "above" : "typical",
  };
}

interface SnapshotRow {
  date: string;
  min_price: string;
  avg_price: string;
}

export function routePriceHistory(originCode: string, destinationCode: string, days: number, now = Date.now()) {
  const today = tehranTodayKey(now);
  const key = `${SEARCH_CACHE_PREFIX}hist:${originCode}:${destinationCode}:${days}:${today}`;
  return cached<PriceHistory>(key, HISTORY_TTL_SECONDS, async () => {
    const rows = (await AppDataSource.query(
      `SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS date, min_price, avg_price
         FROM route_price_snapshots
        WHERE origin_code = $1 AND destination_code = $2 AND snapshot_date > $3::date AND snapshot_date <= $4::date
        ORDER BY snapshot_date`,
      [originCode, destinationCode, addDaysToDateKey(today, -days), today],
    )) as SnapshotRow[];
    const points: HistoryPoint[] = rows.map((r) => ({
      date: r.date,
      minPrice: Number(r.min_price),
      avgPrice: Number(r.avg_price),
    }));

    // Keep "today" live even if the worker hasn't snapshotted yet.
    if (points[points.length - 1]?.date !== today) {
      const [live] = (await AppDataSource.query(
        `${SNAPSHOT_SELECT} AND f.origin_code = $1 AND f.destination_code = $2 GROUP BY f.origin_code, f.destination_code`,
        [originCode, destinationCode],
      )) as { min_price: string; avg_price: string }[];
      if (live) points.push({ date: today, minPrice: Number(live.min_price), avgPrice: Number(live.avg_price) });
    }
    return { originCode, destinationCode, points, summary: summarizeHistory(points) };
  });
}
