/** "Where can I fly cheapest from X?" — every destination ranked by its lowest fare. */
import { AppDataSource } from "../database/dataSource";
import { findAirport } from "../domain/airports";
import { tehranWallClockSql } from "../domain/time";
import { cached } from "./redis";
import { SEARCH_CACHE_PREFIX } from "./flightService";
import { VISIBLE_LISTING_SQL } from "./visibility";

export const EXPLORE_SCOPES = ["all", "domestic", "international"] as const;
export type ExploreScope = (typeof EXPLORE_SCOPES)[number];

export interface ExploreDestination {
  code: string;
  city: string;
  isInternational: boolean;
  /** Lowest economy fare in the window. */
  minPrice: number;
  /** Tehran date of that fare. */
  cheapestDate: string;
  /** Distinct real flights in the window. */
  flights: number;
  airlines: string[];
}

export interface ExploreResult {
  originCode: string;
  days: number;
  scope: ExploreScope;
  destinations: ExploreDestination[];
}

const EXPLORE_TTL_SECONDS = 300;

interface Row {
  destination_code: string;
  min_price: string;
  cheapest_date: string;
  flights: string;
  airlines: string[];
}

export function exploreFrom(originCode: string, days: number, scope: ExploreScope): Promise<ExploreResult> {
  const key = `${SEARCH_CACHE_PREFIX}explore:${originCode}:${days}`;
  return cached(key, EXPLORE_TTL_SECONDS, async () => {
    // Economy only, so the comparison between destinations is like for like.
    const rows = (await AppDataSource.query(
      `WITH window_listings AS (
         SELECT f.destination_code, f.price_toman, f.airline, f.flight_no, f.depart_at
           FROM flight_listings f
          WHERE f.origin_code = $1
            AND ${VISIBLE_LISTING_SQL}
            AND f.cabin = 'economy'
            AND f.depart_at < now() + make_interval(days => $2)
       ),
       cheapest AS (
         SELECT DISTINCT ON (destination_code)
                destination_code, price_toman AS min_price,
                to_char(${tehranWallClockSql("depart_at")}, 'YYYY-MM-DD') AS cheapest_date
           FROM window_listings
          ORDER BY destination_code, price_toman, depart_at
       ),
       totals AS (
         SELECT destination_code,
                count(DISTINCT airline || '|' || flight_no || '|' || date_trunc('minute', depart_at)) AS flights,
                array_agg(DISTINCT airline ORDER BY airline) AS airlines
           FROM window_listings
          GROUP BY destination_code
       )
       SELECT c.destination_code, c.min_price, c.cheapest_date, t.flights, t.airlines
         FROM cheapest c JOIN totals t USING (destination_code)
        ORDER BY c.min_price, c.destination_code`,
      [originCode, days],
    )) as Row[];

    const destinations = rows.flatMap((r): ExploreDestination[] => {
      const airport = findAirport(r.destination_code);
      if (!airport) return [];
      return [
        {
          code: airport.code,
          city: airport.city,
          isInternational: airport.isInternational,
          minPrice: Number(r.min_price),
          cheapestDate: r.cheapest_date,
          flights: Number(r.flights),
          airlines: r.airlines,
        },
      ];
    });
    return { originCode, days, scope: "all" as ExploreScope, destinations };
  }).then((all) => ({
    ...all,
    scope,
    // Scope is applied after the cache so the three views share one query.
    destinations:
      scope === "all" ? all.destinations : all.destinations.filter((d) => d.isInternational === (scope === "international")),
  }));
}
