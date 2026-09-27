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
import type { SearchFacets, SearchParams } from "@/lib/types";
import { useApiQuery, type QueryState } from "@/lib/use-api-query";
import { usePagedSearch, type PagedSearch } from "@/lib/use-paged-search";
import type { CalendarRequest } from "@/hooks/use-price-calendar";

export interface LegResults {
  leg: Leg;
  route: { from: string; to: string; date?: string };
  filters: SearchFiltersState;
  filterCount: number;
  /** Route + filters for the date strip (the price cap is what it displays, so it's excluded). */
  calendarRequest: Omit<CalendarRequest, "start" | "days">;
  facets: QueryState<SearchFacets>;
  /** The results, fetched from the server ten at a time. */
  results: PagedSearch;
}

/** Round trips: the other leg's choice, as the times this leg's flights must keep to. */
export type Pairing = Pick<SearchParams, "departFrom" | "arriveBy">;

export function useLegResults(state: SearchState, leg: Leg, pairing?: Pairing): LegResults {
  const route = legRoute(state, leg);
  const filters = legFilters(state, leg);
  const apiParams = toApiParams(state, leg);
  const { date, sort, maxPriceToman, ...calendarRequest } = apiParams;
  const facets = useApiQuery(`facets:${route.from}:${route.to}:${route.date ?? ""}`, (signal) =>
    api.searchFacets({ originCode: route.from, destinationCode: route.to, date: route.date }, signal),
  );
  const results = usePagedSearch({ ...apiParams, ...pairing });
  return { leg, route, filters, filterCount: activeFilterCount(filters), calendarRequest, facets, results };
}

/** Summary line under the results heading, e.g. "۴ پرواز از ۱۲ پرواز". */
export function resultsSummary({ results, facets, filterCount }: LegResults): string {
  if (results.first.isLoading) return "در حال جستجوی پروازها…";
  if (results.first.error && !results.first.data) return "دریافت نتایج ناموفق بود";
  const count = results.total ?? 0;
  const total = facets.data?.total;
  return filterCount > 0 && total !== undefined
    ? `${toFaDigits(count)} پرواز از ${toFaDigits(total)} پرواز`
    : `${toFaDigits(count)} پرواز`;
}
