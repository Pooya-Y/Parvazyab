import { In } from "typeorm";
import { accounts, flightListings } from "../database/dataSource";
import { cached } from "./redis";
import {
  applyFilters,
  groupOffersByFlight,
  rankFlights,
  resultBounds,
  sortFlights,
  type FlightCard,
  type Listing,
  type Cabin,
  type FareType,
  type SearchFilters,
} from "./flightsCore";
import { whereVisible } from "./visibility";
import { resolveCanonicalAirlineName } from "../domain/airlineRegistry";
import { tehranDayBounds } from "../domain/time";
import type { SearchQuery } from "../api/schemas";

const CABINS: Cabin[] = ["economy", "business"];
const FARE_TYPES: FareType[] = ["scheduled", "charter"];

export const SEARCH_CACHE_PREFIX = "search:";
const SEARCH_CACHE_TTL_SECONDS = 30;
const MAX_LISTINGS_PER_ROUTE = 5000;
const FALLBACK_AGENCY_NAME = "آژانس";

/**
 * All upcoming, active flights on a route (optionally one Tehran calendar day),
 * grouped into one card per real flight. Cached briefly; writes invalidate it.
 */
export function loadRouteFlights(originCode: string, destinationCode: string, date?: string): Promise<FlightCard[]> {
  const key = `${SEARCH_CACHE_PREFIX}${originCode}:${destinationCode}:${date ?? "all"}`;
  return cached(key, SEARCH_CACHE_TTL_SECONDS, async () => {
    const qb = whereVisible(
      flightListings()
        .createQueryBuilder("f")
        .where("f.originCode = :originCode", { originCode })
        .andWhere("f.destinationCode = :destinationCode", { destinationCode }),
    )
      .orderBy("f.departAt", "ASC")
      .limit(MAX_LISTINGS_PER_ROUTE);
    const bounds = date ? tehranDayBounds(date) : null;
    if (bounds) {
      qb.andWhere("f.departAt >= :dayStart AND f.departAt < :dayEnd", {
        dayStart: new Date(bounds[0]),
        dayEnd: new Date(bounds[1]),
      });
    }
    const rows = await qb.getMany();

    const accountIds = [...new Set(rows.map((r) => r.accountId))];
    const owners = accountIds.length
      ? await accounts().find({ where: { id: In(accountIds) }, select: { id: true, name: true, agencyName: true } })
      : [];
    const agencyNames = new Map(owners.map((a) => [a.id, a.agencyName || a.name || FALLBACK_AGENCY_NAME]));

    const listings: Listing[] = rows.map((r) => ({
      ...r,
      departAt: r.departAt.getTime(),
      arriveAt: r.arriveAt.getTime(),
      airline: resolveCanonicalAirlineName(r.airline),
      agencyName: agencyNames.get(r.accountId) ?? FALLBACK_AGENCY_NAME,
    }));
    return groupOffersByFlight(listings);
  });
}

export async function searchFlights(q: SearchQuery): Promise<FlightCard[]> {
  const flights = await loadRouteFlights(q.originCode, q.destinationCode, q.date);
  const filters: SearchFilters = {
    airlines: q.airlines,
    maxStops: q.maxStops,
    cabin: q.cabin,
    fareType: q.fareType,
    maxPriceToman: q.maxPriceToman,
    directOnly: q.directOnly,
    departWindow:
      q.departFromHour !== undefined && q.departToHour !== undefined
        ? { fromHour: q.departFromHour, toHour: q.departToHour }
        : undefined,
    arriveWindow:
      q.arriveFromHour !== undefined && q.arriveToHour !== undefined
        ? { fromHour: q.arriveFromHour, toHour: q.arriveToHour }
        : undefined,
  };
  const ranked = rankFlights(applyFilters(flights, filters), q.mode ?? "relevance");
  return q.sort ? sortFlights(ranked, q.sort) : ranked;
}

export interface SearchFacets {
  total: number;
  directCount: number;
  airlines: string[];
  minPrice: number;
  maxPrice: number;
  minDuration: number;
  maxDuration: number;
  /** Cabins sold on the route, so the client only offers a cabin filter when it matters. */
  cabins: Cabin[];
  /** Fare types sold on the route (charter/scheduled). */
  fareTypes: FareType[];
}

export async function searchFacets(originCode: string, destinationCode: string, date?: string): Promise<SearchFacets> {
  const flights = await loadRouteFlights(originCode, destinationCode, date);
  if (flights.length === 0) {
    return {
      total: 0,
      directCount: 0,
      airlines: [],
      minPrice: 0,
      maxPrice: 0,
      minDuration: 0,
      maxDuration: 0,
      cabins: [],
      fareTypes: [],
    };
  }
  const bounds = resultBounds(flights);
  return {
    total: flights.length,
    directCount: flights.filter((f) => f.stops === 0).length,
    airlines: [...new Set(flights.map((f) => f.airline))].sort((a, b) => a.localeCompare(b, "fa")),
    minPrice: bounds.minPrice,
    maxPrice: bounds.maxPrice,
    minDuration: bounds.minDuration,
    maxDuration: bounds.maxDuration,
    cabins: CABINS.filter((c) => flights.some((f) => f.offers.some((o) => o.cabin === c))),
    fareTypes: FARE_TYPES.filter((t) => flights.some((f) => f.offers.some((o) => o.fareType === t))),
  };
}

export async function findFlight(originCode: string, destinationCode: string, flightId: string) {
  const flights = await loadRouteFlights(originCode, destinationCode);
  // Rank against the whole route so badges ("cheapest", ...) keep their meaning.
  return rankFlights(flights).find((f) => f.id === flightId) ?? null;
}
