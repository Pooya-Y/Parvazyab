import { createHmac } from "node:crypto";
import type { Request } from "express";
import { AppDataSource, flightListings } from "../database/dataSource";
import type { FlightListing } from "../database/entities";
import { config } from "../config/env";
import { TEHRAN_OFFSET_MINUTES, addDaysToDateKey, tehranTodayKey } from "../domain/time";
import { VISIBLE_LISTING_SQL } from "./visibility";

/** Where on the site a "buy" click came from. */
export const CLICK_SOURCES = ["search", "detail", "roundtrip", "other"] as const;
export type ClickSource = (typeof CLICK_SOURCES)[number];

/** Link unfurlers, crawlers and scripts: following a link is not a traveller's click. */
const NON_HUMAN =
  /bot|crawl|spider|slurp|preview|unfurl|facebookexternalhit|embedly|whatsapp|telegram|skype|discord|slack|curl|wget|python|java\/|go-http|headless|lighthouse/i;

export const isLikelyBot = (userAgent: string | undefined) => !userAgent || NON_HUMAN.test(userAgent);

/** Repeat clicks on one listing by one visitor within this window count once. */
const DEDUPE_MINUTES = 30;

/**
 * A pseudonymous visitor id: the same browser on the same address maps to the
 * same value for one Iran calendar day, then to a new one.
 */
export function visitorHash(req: Request, now = Date.now()): string {
  return createHmac("sha256", config.JWT_SECRET)
    .update(`click:${req.ip ?? ""}:${req.get("user-agent") ?? ""}:${tehranTodayKey(now)}`)
    .digest("hex");
}

const isHttpUrl = (url: string) => URL.canParse(url) && /^https?:$/.test(new URL(url).protocol);

export type OutboundTarget = { kind: "agency"; url: string; listing: FlightListing } | { kind: "app"; path: string };

/**
 * Where a "buy" click should land. A listing that is gone, hidden, departed or
 * has an unusable link sends the traveller back to that route's results instead
 * of a dead agency page.
 */
export async function outboundTarget(listingId: string): Promise<OutboundTarget> {
  const listing = await flightListings().findOne({ where: { id: listingId } });
  if (!listing) return { kind: "app", path: "/" };
  // The same rule as search: a suspended listing (or agency) can't be bought through here either.
  const [{ visible }] = (await AppDataSource.query(
    `SELECT EXISTS (SELECT 1 FROM flight_listings f WHERE f.id = $1 AND ${VISIBLE_LISTING_SQL}) AS visible`,
    [listing.id],
  )) as { visible: boolean }[];
  if (visible && isHttpUrl(listing.bookingUrl)) return { kind: "agency", url: listing.bookingUrl, listing };
  const params = new URLSearchParams({ from: listing.originCode, to: listing.destinationCode });
  return { kind: "app", path: `/search?${params.toString()}` };
}

/** Records one click unless it's a bot or a repeat within the dedupe window. Returns whether it counted. */
export async function recordClick(listing: FlightListing, source: ClickSource, req: Request): Promise<boolean> {
  if (isLikelyBot(req.get("user-agent"))) return false;
  const rows = (await AppDataSource.query(
    `INSERT INTO listing_clicks
       (listing_id, agency_id, origin_code, destination_code, airline, flight_no, depart_at, price_toman, source, visitor_hash)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      WHERE NOT EXISTS (
        SELECT 1 FROM listing_clicks
         WHERE listing_id = $1 AND visitor_hash = $10 AND created_at > now() - make_interval(mins => $11)
      )
     RETURNING id`,
    [
      listing.id,
      listing.accountId,
      listing.originCode,
      listing.destinationCode,
      listing.airline,
      listing.flightNo,
      listing.departAt,
      listing.priceToman,
      source,
      visitorHash(req),
      DEDUPE_MINUTES,
    ],
  )) as unknown[];
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Agency analytics
// ---------------------------------------------------------------------------

const tehranDay = `((created_at AT TIME ZONE 'UTC') + interval '${TEHRAN_OFFSET_MINUTES} minutes')::date`;

export interface ClickStats {
  days: number;
  /** First day of the window (`yyyy-mm-dd`, Iran time); the window ends today. */
  start: string;
  clicks: number;
  visitors: number;
  /** Clicks in the equally long window before this one, for a trend. */
  previousClicks: number;
  daily: { date: string; clicks: number; visitors: number }[];
  topListings: {
    listingId: string | null;
    airline: string;
    flightNo: string;
    originCode: string;
    destinationCode: string;
    departAt: number;
    clicks: number;
  }[];
  routes: { originCode: string; destinationCode: string; clicks: number }[];
  sources: Record<ClickSource, number>;
}

export async function clickStats(agencyId: string, days: number, now = Date.now()): Promise<ClickStats> {
  const today = tehranTodayKey(now);
  const start = addDaysToDateKey(today, -(days - 1));
  const previousStart = addDaysToDateKey(start, -days);
  const inWindow = `agency_id = $1 AND ${tehranDay} BETWEEN $2::date AND $3::date`;
  const params = [agencyId, start, today];

  const [[totals], daily, top, routes, sources] = (await Promise.all([
    AppDataSource.query(
      `SELECT count(*) FILTER (WHERE ${tehranDay} >= $2::date)::int AS clicks,
              count(DISTINCT visitor_hash) FILTER (WHERE ${tehranDay} >= $2::date)::int AS visitors,
              count(*) FILTER (WHERE ${tehranDay} < $2::date)::int AS "previousClicks"
         FROM listing_clicks
        WHERE agency_id = $1 AND ${tehranDay} BETWEEN $4::date AND $3::date`,
      [agencyId, start, today, previousStart],
    ),
    AppDataSource.query(
      `SELECT ${tehranDay}::text AS date, count(*)::int AS clicks, count(DISTINCT visitor_hash)::int AS visitors
         FROM listing_clicks WHERE ${inWindow}
        GROUP BY 1`,
      params,
    ),
    AppDataSource.query(
      `SELECT listing_id AS "listingId", airline, flight_no AS "flightNo", origin_code AS "originCode",
              destination_code AS "destinationCode", depart_at AS "departAt", count(*)::int AS clicks
         FROM listing_clicks WHERE ${inWindow}
        GROUP BY listing_id, airline, flight_no, origin_code, destination_code, depart_at
        ORDER BY clicks DESC, depart_at
        LIMIT 8`,
      params,
    ),
    AppDataSource.query(
      `SELECT origin_code AS "originCode", destination_code AS "destinationCode", count(*)::int AS clicks
         FROM listing_clicks WHERE ${inWindow}
        GROUP BY origin_code, destination_code
        ORDER BY clicks DESC
        LIMIT 6`,
      params,
    ),
    AppDataSource.query(
      `SELECT source, count(*)::int AS clicks FROM listing_clicks WHERE ${inWindow} GROUP BY source`,
      params,
    ),
  ])) as [
    { clicks: number; visitors: number; previousClicks: number }[],
    { date: string; clicks: number; visitors: number }[],
    (Omit<ClickStats["topListings"][number], "departAt"> & { departAt: Date })[],
    ClickStats["routes"],
    { source: ClickSource; clicks: number }[],
  ];

  // Every day of the window, zeros included: a gap is information too.
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const date = addDaysToDateKey(start, i);
    return byDate.get(date) ?? { date, clicks: 0, visitors: 0 };
  });
  const sourceTotals = Object.fromEntries(CLICK_SOURCES.map((s) => [s, 0])) as Record<ClickSource, number>;
  for (const row of sources) sourceTotals[row.source] = row.clicks;

  return {
    days,
    start,
    clicks: totals.clicks,
    visitors: totals.visitors,
    previousClicks: totals.previousClicks,
    daily: series,
    topListings: top.map((t) => ({ ...t, departAt: t.departAt.getTime() })),
    routes,
    sources: sourceTotals,
  };
}

/** Click history is kept for 13 months. */
export async function purgeOldClicks(olderThanDays = 400): Promise<number> {
  const [{ count }] = (await AppDataSource.query(
    `WITH purged AS (
       DELETE FROM listing_clicks WHERE created_at < now() - make_interval(days => $1) RETURNING 1
     )
     SELECT count(*)::int AS count FROM purged`,
    [olderThanDays],
  )) as { count: number }[];
  return count;
}
