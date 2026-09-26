import type {
  AdminStats,
  AgencyStats,
  Flight,
  Listing,
  ListingInput,
  PriceCalendar,
  PriceHistory,
  ExploreResult,
  ExploreScope,
  PopularRoute,
  SavedFlight,
  SearchFacets,
  SearchParams,
  User,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

/** A failed API call. `code` is the server's stable error code (or NETWORK_ERROR). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(status: number, code: string, details: string[] = []) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | string[] | undefined | null;

function toQueryString(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, { method = "GET", query, body, signal }: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${toQueryString(query)}`, {
      method,
      credentials: "include",
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR");
  }
  if (!res.ok) {
    let payload: { error?: string; details?: string[] } = {};
    try {
      payload = await res.json();
    } catch {
      // non-JSON error page (e.g. proxy 502)
    }
    throw new ApiError(res.status, payload.error ?? `HTTP_${res.status}`, payload.details ?? []);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  search: (q: SearchParams, signal?: AbortSignal) => request<Flight[]>("/search", { query: { ...q }, signal }),
  searchFacets: (q: Pick<SearchParams, "originCode" | "destinationCode" | "date">, signal?: AbortSignal) =>
    request<SearchFacets>("/search/facets", { query: { ...q }, signal }),
  /** Cheapest price per day; `params` carries the same filters as search (minus date/sort/price). */
  priceCalendar: (
    params: Omit<SearchParams, "date" | "sort" | "maxPriceToman"> & { start: string; days: number },
    signal?: AbortSignal,
  ) => request<PriceCalendar>("/search/calendar", { query: { ...params }, signal }),
  priceHistory: (originCode: string, destinationCode: string, days: number, signal?: AbortSignal) =>
    request<PriceHistory>(`/routes/${originCode}-${destinationCode}/price-history`, { query: { days }, signal }),
  explore: (originCode: string, days: number, scope: ExploreScope, signal?: AbortSignal) =>
    request<ExploreResult>("/explore", { query: { originCode, days, scope }, signal }),
  popularRoutes: (signal?: AbortSignal) => request<PopularRoute[]>("/routes/popular", { signal }),

  auth: {
    me: (signal?: AbortSignal) => request<{ user: User | null }>("/auth/me", { signal }),
    login: (email: string, password: string) =>
      request<{ user: User }>("/auth/login", { method: "POST", body: { email, password } }),
    register: (name: string, email: string, password: string) =>
      request<{ user: User }>("/auth/register", { method: "POST", body: { name, email, password } }),
    guest: () => request<{ user: User }>("/auth/guest", { method: "POST" }),
    logout: () => request<void>("/auth/logout", { method: "POST" }),
  },

  saved: {
    list: (signal?: AbortSignal) => request<SavedFlight[]>("/saved-flights", { signal }),
    save: (flight: Flight) =>
      request<SavedFlight>("/saved-flights", {
        method: "POST",
        body: {
          snapshot: {
            id: flight.id,
            airline: flight.airline,
            flightNo: flight.flightNo,
            originCode: flight.originCode,
            originCity: flight.originCity,
            destinationCode: flight.destinationCode,
            destinationCity: flight.destinationCity,
            departAt: flight.departAt,
            arriveAt: flight.arriveAt,
            durationMin: flight.durationMin,
            stops: flight.stops,
            cabin: flight.cabin,
            bestPriceToman: flight.bestPriceToman,
            agencyName: flight.offers[0]?.agencyName ?? "آژانس",
          },
        },
      }),
    remove: (flightKey: string) =>
      request<void>(`/saved-flights/${encodeURIComponent(flightKey)}`, { method: "DELETE" }),
  },

  dashboard: {
    stats: (signal?: AbortSignal) => request<AgencyStats>("/dashboard/stats", { signal }),
    listings: (signal?: AbortSignal) => request<Listing[]>("/dashboard/listings", { signal }),
    upsertListing: (input: ListingInput) =>
      request<{ id: string }>("/dashboard/listings", { method: "POST", body: input }),
    setListingActive: (id: string, isActive: boolean) =>
      request<{ ok: true }>(`/dashboard/listings/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: { isActive },
      }),
    deleteListing: (id: string) => request<void>(`/dashboard/listings/${encodeURIComponent(id)}`, { method: "DELETE" }),
    becomeAgency: (agencyName: string) =>
      request<{ ok: true }>("/dashboard/become-agency", { method: "POST", body: { agencyName } }),
  },

  admin: {
    stats: (signal?: AbortSignal) => request<AdminStats>("/admin/stats", { signal }),
    users: (signal?: AbortSignal) => request<User[]>("/admin/users", { signal }),
    setRole: (userId: string, accountRole: "user" | "agency") =>
      request<{ ok: true }>(`/admin/users/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        body: { accountRole },
      }),
  },
};

/** Only follow http(s) links from the API; anything else (e.g. `javascript:`) is dropped. */
export function safeExternalUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
