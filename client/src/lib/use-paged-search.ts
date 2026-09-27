import { useState } from "react";
import { api } from "./api";
import type { Flight, SearchPage, SearchParams } from "./types";
import { useApiQuery, type QueryState } from "./use-api-query";

/** Flights per request. */
export const SEARCH_PAGE_SIZE = 10;

/**
 * Later pages appended to the first. Results can shift between requests (prices
 * change, flights depart), so a flight already shown isn't shown twice.
 */
export function mergePages(first: Flight[], later: Flight[]): Flight[] {
  const seen = new Set(first.map((f) => f.id));
  const merged = [...first];
  for (const flight of later) {
    if (seen.has(flight.id)) continue;
    seen.add(flight.id);
    merged.push(flight);
  }
  return merged;
}

export interface PagedSearch {
  /** The first page's request: loading, errors, retry. */
  first: QueryState<SearchPage>;
  /** Every flight fetched so far, in order. */
  flights: Flight[];
  /** Flights matching the search across all pages (known once the first page is in). */
  total: number | undefined;
  /** Lowest price across all pages. */
  minPrice: number | null | undefined;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: unknown;
  loadMore: () => void;
}

interface Later {
  /** The search these pages belong to. */
  key: string | null;
  flights: Flight[];
  loading: boolean;
  error: unknown;
  /** The server ran out early (results shrank since the first page). */
  exhausted: boolean;
}

const NONE: Later = { key: null, flights: [], loading: false, error: null, exhausted: false };

/**
 * Search results fetched a page at a time: the first page with the search, each
 * next one on `loadMore` (the list calls it as its end scrolls into view). A new
 * search (route, day, filters, sort) starts again from the first page, while the
 * previous results stay on screen until it arrives.
 */
export function usePagedSearch(params: SearchParams): PagedSearch {
  const key = `search:${JSON.stringify(params)}`;
  const first = useApiQuery(key, (signal) => api.search({ ...params, offset: 0, limit: SEARCH_PAGE_SIZE }, signal));
  const [state, setLater] = useState<Later>(NONE);

  // Later pages go with the first page on screen, which is the previous search's while a new one loads.
  const later = state.key !== null && state.key === first.dataKey ? state : NONE;
  const firstFlights = first.data?.flights ?? [];
  const flights = mergePages(firstFlights, later.flights);
  const total = first.data?.total;
  const fetched = firstFlights.length + later.flights.length;
  const hasMore = total !== undefined && fetched < total && !later.exhausted;

  const loadMore = () => {
    // Only for the current search, once its first page is in, one page at a time.
    if (!hasMore || later.loading || first.isFetching || first.dataKey !== key) return;
    setLater({ ...later, key, loading: true, error: null });
    api.search({ ...params, offset: fetched, limit: SEARCH_PAGE_SIZE }).then(
      (page) =>
        setLater((s) =>
          s.key !== key
            ? s
            : {
                key,
                flights: [...s.flights, ...page.flights],
                loading: false,
                error: null,
                exhausted: page.flights.length < SEARCH_PAGE_SIZE,
              },
        ),
      (error: unknown) => setLater((s) => (s.key !== key ? s : { ...s, loading: false, error })),
    );
  };

  return {
    first,
    flights,
    total,
    minPrice: first.data?.minPrice,
    hasMore,
    loadingMore: later.loading,
    moreError: later.error,
    loadMore,
  };
}
