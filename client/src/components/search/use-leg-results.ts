import { api } from "@/lib/api";
import { toFaDigits } from "@/lib/persian";
import {
  activeFilterCount,
  legFilters,
  legRoute,
  toApiParams,
  type Leg,
  type SearchFiltersState,
  type SearchState,
} from "@/lib/search-state";
import type { Flight, SearchFacets } from "@/lib/types";
import { useApiQuery, type QueryState } from "@/lib/use-api-query";
import type { CalendarRequest } from "@/hooks/use-price-calendar";

export interface LegResults {
  leg: Leg;
  route: { from: string; to: string; date?: string };
  filters: SearchFiltersState;
  filterCount: number;
  /** Route + filters for the date strip (the price cap is what it displays, so it's excluded). */
  calendarRequest: Omit<CalendarRequest, "start" | "days">;
  facets: QueryState<SearchFacets>;
  results: QueryState<Flight[]>;
  /** Identifies this search (route, day, filters, sort): a new one starts the list over. */
  searchKey: string;
}

export function useLegResults(state: SearchState, leg: Leg): LegResults {
  const route = legRoute(state, leg);
  const filters = legFilters(state, leg);
  const apiParams = toApiParams(state, leg);
  const { date, sort, maxPriceToman, ...calendarRequest } = apiParams;
  const facets = useApiQuery(`facets:${route.from}:${route.to}:${route.date ?? ""}`, (signal) =>
    api.searchFacets({ originCode: route.from, destinationCode: route.to, date: route.date }, signal),
  );
  const searchKey = `search:${JSON.stringify(apiParams)}`;
  const results = useApiQuery(searchKey, (signal) => api.search(apiParams, signal));
  return { leg, route, filters, filterCount: activeFilterCount(filters), calendarRequest, facets, results, searchKey };
}

/** Summary line under the results heading, e.g. "۴ پرواز از ۱۲ پرواز". */
export function resultsSummary({ results, facets, filterCount }: LegResults): string {
  if (results.isLoading) return "در حال جستجوی پروازها…";
  if (results.error && !results.data) return "دریافت نتایج ناموفق بود";
  const count = results.data?.length ?? 0;
  const total = facets.data?.total;
  return filterCount > 0 && total !== undefined
    ? `${toFaDigits(count)} پرواز از ${toFaDigits(total)} پرواز`
    : `${toFaDigits(count)} پرواز`;
}
