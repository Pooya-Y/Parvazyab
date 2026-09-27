import type {
  AdminListing,
  AdminStats,
  AuditEntry,
  AgencyProfile,
  AgencyReview,
  AgencyStats,
  AgencySummary,
  ApiKey,
  ClickStats,
  ImportReport,
  Flight,
  Listing,
  ListingInput,
  ModerationQueue,
  OwnAgencyProfile,
  PriceCalendar,
  PriceHistory,
  ExploreResult,
  ExploreScope,
  Inbox,
  OtpChallenge,
  PopularRoute,
  PriceAlert,
  PriceAlertInput,
  SavedFlight,
  SearchFacets,
  ReportReason,
  SearchPage,
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Send `body` (a string) as-is with this type, e.g. text/csv, instead of as JSON. */
  contentType?: string;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  { method = "GET", query, body, contentType, signal }: RequestOptions = {},
): Promise<T> {
  let res: Response;
  const raw = contentType !== undefined && typeof body === "string";
  try {
    res = await fetch(`${BASE}${path}${toQueryString(query)}`, {
      method,
      credentials: "include",
      signal,
      headers: body === undefined ? undefined : { "Content-Type": raw ? contentType : "application/json" },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
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
  /** One page of results (ten unless `limit` says otherwise). */
  search: (q: SearchParams, signal?: AbortSignal) => request<SearchPage>("/search", { query: { ...q }, signal }),
  /** One flight by id, ranked among its day's flights when `date` is given. */
  flight: (originCode: string, destinationCode: string, id: string, date?: string, signal?: AbortSignal) =>
    request<{ flight: Flight }>(`/flights/${originCode}-${destinationCode}/${encodeURIComponent(id)}`, {
      query: { date },
      signal,
    }),
  /** A traveller's report on an agency's offer (updates their open report on it, if any). */
  reportListing: (listingId: string, report: { reason: ReportReason; observedPrice: number | null; note: string }) =>
    request<{ ok: true }>(`/listings/${encodeURIComponent(listingId)}/reports`, { method: "POST", body: report }),
  searchFacets: (q: Pick<SearchParams, "originCode" | "destinationCode" | "date">, signal?: AbortSignal) =>
    request<SearchFacets>("/search/facets", { query: { ...q }, signal }),
  /** Cheapest price per day; `params` carries the same filters as search (minus date/sort/price). */
  priceCalendar: (
    params: Omit<SearchParams, "date" | "sort" | "maxPriceToman"> & { start: string; days: number },
    signal?: AbortSignal,
  ) => request<PriceCalendar>("/search/calendar", { query: { ...params }, signal }),
  priceHistory: (originCode: string, destinationCode: string, days: number, signal?: AbortSignal) =>
    request<PriceHistory>(`/routes/${originCode}-${destinationCode}/price-history`, { query: { days }, signal }),
  /** `originCode` may list several airports, comma-separated ("THR,IKA" for all of Tehran). */
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
    /** Always succeeds, whether or not the email has an account. */
    forgotPassword: (email: string) =>
      request<{ ok: true }>("/auth/password/forgot", { method: "POST", body: { email } }),
    /** Signs this browser in and ends every other session. */
    resetPassword: (token: string, password: string) =>
      request<{ user: User }>("/auth/password/reset", { method: "POST", body: { token, password } }),
    verifyEmail: (token: string) => request<{ ok: true }>("/auth/email/verify", { method: "POST", body: { token } }),
    /** Texts a sign-in code; the same answer whether or not the number has an account. */
    requestOtp: (phone: string) => request<OtpChallenge>("/auth/otp/request", { method: "POST", body: { phone } }),
    /** Signs in to the number's account, creating it (`created`) if there was none. */
    verifyOtp: (challengeId: string, code: string) =>
      request<{ user: User; created: boolean }>("/auth/otp/verify", { method: "POST", body: { challengeId, code } }),
  },

  account: {
    updateProfile: (name: string) => request<{ user: User }>("/account/profile", { method: "PATCH", body: { name } }),
    /** Keeps this session; every other one ends. */
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ user: User }>("/account/password", { method: "PUT", body: { currentPassword, newPassword } }),
    resendVerification: () => request<{ ok: true }>("/account/email/verification", { method: "POST" }),
    signOutOtherSessions: () => request<void>("/account/sessions", { method: "DELETE" }),
    requestPhoneLink: (phone: string) =>
      request<OtpChallenge>("/account/phone/verification", { method: "POST", body: { phone } }),
    confirmPhoneLink: (challengeId: string, code: string) =>
      request<{ user: User }>("/account/phone", { method: "PUT", body: { challengeId, code } }),
    removePhone: () => request<{ user: User }>("/account/phone", { method: "DELETE" }),
    /** For accounts made by SMS code: adds email sign-in and sends a verification link. */
    addEmail: (email: string, password: string) =>
      request<{ user: User }>("/account/email", { method: "POST", body: { email, password } }),
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
    /** Preview (default) or commit a CSV of listings. */
    importListings: (csv: string, options: { commit?: boolean; skipInvalid?: boolean } = {}) =>
      request<ImportReport>("/dashboard/listings/import", {
        method: "POST",
        query: { commit: options.commit || undefined, skipInvalid: options.skipInvalid || undefined },
        body: csv,
        contentType: "text/csv",
      }),
    apiKeys: (signal?: AbortSignal) => request<ApiKey[]>("/dashboard/api-keys", { signal }),
    profile: (signal?: AbortSignal) => request<OwnAgencyProfile>("/dashboard/profile", { signal }),
    updateProfile: (input: Omit<OwnAgencyProfile, "name" | "verified" | "verificationPending">) =>
      request<OwnAgencyProfile>("/dashboard/profile", { method: "PUT", body: input }),
    reviews: (signal?: AbortSignal) => request<AgencyReview[]>("/dashboard/reviews", { signal }),
    requestVerification: () => request<{ ok: true }>("/dashboard/profile/verification", { method: "POST" }),
    replyToReview: (id: string, reply: string) =>
      request<{ ok: true }>(`/dashboard/reviews/${encodeURIComponent(id)}/reply`, { method: "PUT", body: { reply } }),
    /** The response carries the key itself: the only time it is ever shown. */
    createApiKey: (name: string) =>
      request<ApiKey & { key: string }>("/dashboard/api-keys", { method: "POST", body: { name } }),
    revokeApiKey: (id: string) => request<void>(`/dashboard/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
    clicks: (days: number, signal?: AbortSignal) =>
      request<ClickStats>("/dashboard/clicks", { query: { days }, signal }),
    becomeAgency: (agencyName: string) =>
      request<{ ok: true }>("/dashboard/become-agency", { method: "POST", body: { agencyName } }),
  },

  agencies: {
    list: (signal?: AbortSignal) => request<AgencySummary[]>("/agencies", { signal }),
    get: (slug: string, signal?: AbortSignal) =>
      request<AgencyProfile>(`/agencies/${encodeURIComponent(slug)}`, { signal }),
    reviews: (slug: string, options: { before?: number; limit?: number } = {}, signal?: AbortSignal) =>
      request<{ items: AgencyReview[]; mine: AgencyReview | null }>(`/agencies/${encodeURIComponent(slug)}/reviews`, {
        query: { before: options.before, limit: options.limit },
        signal,
      }),
    /** Writing again edits the one review a traveller has of an agency. */
    saveReview: (slug: string, input: { rating: number; body: string }) =>
      request<AgencyReview>(`/agencies/${encodeURIComponent(slug)}/reviews/mine`, { method: "PUT", body: input }),
    reportReview: (slug: string, reviewId: string, reason: string) =>
      request<{ ok: true }>(`/agencies/${encodeURIComponent(slug)}/reviews/${encodeURIComponent(reviewId)}/report`, {
        method: "POST",
        body: { reason },
      }),
    deleteReview: (slug: string) =>
      request<void>(`/agencies/${encodeURIComponent(slug)}/reviews/mine`, { method: "DELETE" }),
  },

  alerts: {
    list: (signal?: AbortSignal) => request<PriceAlert[]>("/alerts", { signal }),
    create: (input: PriceAlertInput) => request<PriceAlert>("/alerts", { method: "POST", body: input }),
    update: (id: string, patch: { isActive?: boolean; targetPrice?: number | null; notifyEmail?: boolean }) =>
      request<PriceAlert>(`/alerts/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request<void>(`/alerts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** From the link in an alert email; the signature is the permission, no session needed. */
    unsubscribe: (id: string, sig: string) =>
      request<{ ok: true }>(`/alerts/${encodeURIComponent(id)}/unsubscribe`, { method: "POST", query: { sig } }),
  },

  push: {
    /** null: push is switched off on this server. */
    publicKey: () => request<{ publicKey: string | null }>("/push/public-key"),
    subscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      request<{ ok: true }>("/push/subscriptions", { method: "POST", body: subscription }),
    unsubscribe: (endpoint: string) => request<void>("/push/subscriptions", { method: "DELETE", body: { endpoint } }),
  },

  notifications: {
    list: (limit = 20, signal?: AbortSignal) => request<Inbox>("/notifications", { query: { limit }, signal }),
    unreadCount: (signal?: AbortSignal) => request<{ count: number }>("/notifications/unread-count", { signal }),
    /** Marks the given notifications, or all of them, read; returns what is still unread. */
    markRead: (ids?: string[]) =>
      request<{ unreadCount: number }>("/notifications/read", { method: "POST", body: ids ? { ids } : {} }),
  },

  admin: {
    moderation: (signal?: AbortSignal) => request<ModerationQueue>("/admin/moderation", { signal }),
    suspendUser: (id: string, suspended: boolean, reason?: string) =>
      request<{ ok: true }>(`/admin/users/${encodeURIComponent(id)}/suspension`, {
        method: "PUT",
        body: { suspended, reason: reason ?? "" },
      }),
    listings: (q: string, status: "all" | "suspended", signal?: AbortSignal) =>
      request<AdminListing[]>("/admin/listings", { query: { q, status }, signal }),
    suspendListing: (id: string, suspended: boolean, reason?: string) =>
      request<{ ok: true }>(`/admin/listings/${encodeURIComponent(id)}/suspension`, {
        method: "PUT",
        body: { suspended, reason: reason ?? "" },
      }),
    verifyAgency: (agencyId: string, verified: boolean, note?: string) =>
      request<{ ok: true }>(`/admin/agencies/${encodeURIComponent(agencyId)}/verification`, {
        method: "PUT",
        body: { verified, note: note ?? "" },
      }),
    setReviewStatus: (id: string, status: "published" | "hidden") =>
      request<{ ok: true }>(`/admin/reviews/${encodeURIComponent(id)}/status`, { method: "PUT", body: { status } }),
    dismissReports: (id: string) =>
      request<{ ok: true }>(`/admin/reviews/${encodeURIComponent(id)}/dismiss-reports`, { method: "POST" }),
    dismissListingReports: (listingId: string) =>
      request<{ ok: true }>(`/admin/listings/${encodeURIComponent(listingId)}/dismiss-reports`, { method: "POST" }),
    audit: (options: { action?: string; before?: number; limit?: number } = {}, signal?: AbortSignal) =>
      request<AuditEntry[]>("/admin/audit", { query: { ...options }, signal }),
    stats: (signal?: AbortSignal) => request<AdminStats>("/admin/stats", { signal }),
    users: (signal?: AbortSignal) => request<User[]>("/admin/users", { signal }),
    setRole: (userId: string, accountRole: "user" | "agency") =>
      request<{ ok: true }>(`/admin/users/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        body: { accountRole },
      }),
  },
};

export type ClickSource = "search" | "detail" | "roundtrip";

/**
 * The "buy" link for an offer. It goes through the API's counting redirect
 * (agencies see their click analytics); an offer whose own link is unusable
 * gets none, so the button shows as unavailable instead of failing later.
 */
export function offerHref(offer: { listingId: string; bookingUrl: string }, source: ClickSource): string | undefined {
  if (!safeExternalUrl(offer.bookingUrl)) return undefined;
  return `${BASE}/go/${encodeURIComponent(offer.listingId)}?src=${source}`;
}

/** Plain links (downloads) into the API: cookies ride along like any same-site navigation. */
export const apiHref = (path: string) => `${BASE}${path}`;

/** Only follow http(s) links from the API; anything else (e.g. `javascript:`) is dropped. */
export function safeExternalUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
