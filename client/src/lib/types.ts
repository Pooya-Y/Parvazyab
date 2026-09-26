/** Shapes returned by the Parvazyab API (dates are epoch ms). */

export type Cabin = "economy" | "business";
/** "scheduled" = سیستمی (airline fare rules), "charter" = چارتری (charterer's rules). */
export type FareType = "scheduled" | "charter";
export type AccountRole = "admin" | "user" | "agency";

export interface FlightOffer {
  listingId: string;
  agencyId: string;
  agencyName: string;
  cabin: Cabin;
  fareType: FareType;
  priceToman: number;
  bookingUrl: string;
  /** The agency's public profile (/agencies/:slug), verification and rating. */
  agencySlug?: string | null;
  agencyVerified?: boolean;
  agencyRating?: AgencyRating | null;
}

export interface AgencyRating {
  /** One decimal. */
  average: number;
  count: number;
}

export interface AgencySummary {
  slug: string;
  name: string;
  city: string | null;
  verified: boolean;
  rating: AgencyRating | null;
  /** Upcoming flights on sale. */
  listings: number;
}

export interface AgencyProfile {
  agencyId: string;
  slug: string;
  name: string;
  description: string;
  website: string | null;
  supportPhone: string | null;
  city: string | null;
  licenseNo: string | null;
  verified: boolean;
  /** Epoch ms the agency joined. */
  since: number;
  rating: { average: number | null; count: number; histogram: [number, number, number, number, number] };
  routes: { originCode: string; destinationCode: string; minPrice: number; flights: number }[];
}

export interface AgencyReview {
  id: string;
  rating: number;
  body: string;
  /** Shortened: "سارا ک." */
  author: string;
  mine: boolean;
  edited: boolean;
  reply: string | null;
  repliedAt: number | null;
  createdAt: number;
  /** Only on the author's own review and in the agency's dashboard. */
  hidden?: boolean;
}

export interface OwnAgencyProfile {
  slug: string;
  name: string;
  description: string;
  website: string | null;
  supportPhone: string | null;
  city: string | null;
  licenseNo: string | null;
  verified: boolean;
  /** Asked for the verified badge and waiting for an administrator. */
  verificationPending: boolean;
}

export interface ModerationQueue {
  verificationRequests: {
    agencyId: string;
    slug: string;
    name: string;
    city: string | null;
    licenseNo: string | null;
    description: string;
    website: string | null;
    requestedAt: number;
    listings: number;
  }[];
  reportedReviews: {
    reviewId: string;
    rating: number;
    body: string;
    status: "published" | "hidden";
    author: string;
    agencySlug: string | null;
    agencyName: string;
    reports: number;
    reasons: string[];
    createdAt: number;
    lastReportedAt: number;
  }[];
  counts: { suspendedAccounts: number; suspendedListings: number; hiddenReviews: number };
}

export interface AdminListing {
  id: string;
  originCode: string;
  destinationCode: string;
  airline: string;
  flightNo: string;
  departAt: number;
  priceToman: number;
  isActive: boolean;
  suspendedAt: number | null;
  suspensionReason: string | null;
  agencyName: string;
  agencySuspended: boolean;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: number;
  actorName: string | null;
  actorContact: string | null;
}

export interface ExplanationReason {
  kind: string;
  text: string;
}

/** One real flight, possibly sold by several agencies. */
export interface Flight {
  id: string;
  airline: string;
  flightNo: string;
  originCode: string;
  originCity: string;
  destinationCode: string;
  destinationCity: string;
  departAt: number;
  arriveAt: number;
  durationMin: number;
  stops: number;
  cabin: Cabin;
  bestPriceToman: number;
  priceRange: { min: number; max: number };
  agencyCount: number;
  offers: FlightOffer[];
  score?: number;
  badges?: string[];
  reasons?: ExplanationReason[];
}

export interface SearchFacets {
  total: number;
  directCount: number;
  airlines: string[];
  minPrice: number;
  maxPrice: number;
  minDuration: number;
  maxDuration: number;
  cabins: Cabin[];
  fareTypes: FareType[];
}

export interface CalendarDay {
  date: string;
  /** Cheapest price that day, or null when nothing flies. */
  minPrice: number | null;
  flights: number;
}

export interface PriceCalendar {
  start: string;
  days: CalendarDay[];
}

export interface PricePoint {
  date: string;
  minPrice: number;
  avgPrice: number;
}

export interface PriceHistory {
  originCode: string;
  destinationCode: string;
  /** Oldest first; the last point is today. */
  points: PricePoint[];
  summary: {
    current: number;
    average: number;
    low: number;
    high: number;
    deltaPercent: number;
    verdict: "below" | "typical" | "above";
  } | null;
}

export type ExploreScope = "all" | "domestic" | "international";

export interface ExploreDestination {
  code: string;
  city: string;
  isInternational: boolean;
  minPrice: number;
  cheapestDate: string;
  flights: number;
  airlines: string[];
}

export interface ExploreResult {
  originCode: string;
  days: number;
  scope: ExploreScope;
  destinations: ExploreDestination[];
}

export type SortMode = "best" | "cheapest" | "fastest" | "departure" | "arrival";

export interface SearchParams {
  originCode: string;
  destinationCode: string;
  date?: string;
  sort?: SortMode;
  airlines?: string[];
  maxStops?: number;
  maxPriceToman?: number;
  cabin?: Cabin;
  fareType?: FareType;
  departFromHour?: number;
  departToHour?: number;
  arriveFromHour?: number;
  arriveToHour?: number;
}

export interface PopularRoute {
  originCode: string;
  destinationCode: string;
}

export interface User {
  id: string;
  name: string;
  /** Accounts have an email, a verified mobile number (E.164), or both. */
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  /** False for accounts that only ever signed in by SMS code. */
  hasPassword: boolean;
  role: AccountRole;
  accountRole: "agency" | "user";
  agencyName?: string | null;
  /** ISO timestamps; null until the email is verified / the password is first changed. */
  emailVerifiedAt: string | null;
  passwordChangedAt: string | null;
  /** Set by an administrator: the account can't publish, review or create alerts. */
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
}

export interface PriceAlert {
  id: string;
  originCode: string;
  destinationCode: string;
  /** Iran calendar days (`yyyy-mm-dd`), inclusive; both null = any date in the next 30 days. */
  dateFrom: string | null;
  dateTo: string | null;
  cabin: "economy" | "business" | null;
  /** Notify at or below this fare; null = on any real drop (3%+). */
  targetPrice: number | null;
  /** The lowest fare when the alert was made. */
  baselinePrice: number | null;
  /** The lowest fare at the last check. */
  lastPrice: number | null;
  lastCheckedAt: number | null;
  lastNotifiedPrice: number | null;
  lastNotifiedAt: number | null;
  notifyEmail: boolean;
  isActive: boolean;
  createdAt: number;
}

export interface PriceAlertInput {
  originCode: string;
  destinationCode: string;
  dateFrom?: string;
  dateTo?: string;
  cabin?: "economy" | "business";
  targetPrice?: number;
  notifyEmail: boolean;
}

export interface AppNotification {
  id: string;
  kind: "price_drop";
  title: string;
  body: string;
  /** In-app path. */
  link: string | null;
  read: boolean;
  createdAt: number;
}

export interface Inbox {
  items: AppNotification[];
  unreadCount: number;
}

/** A one-time code on its way to a phone. */
export interface OtpChallenge {
  challengeId: string;
  /** E.164 */
  phone: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Seconds before another code may be requested. */
  resendAfter: number;
}

export interface SavedFlight {
  id: string;
  flightKey: string;
  airline: string;
  flightNo: string;
  originCode: string;
  originCity: string;
  destinationCode: string;
  destinationCity: string;
  departAt: number;
  arriveAt: number;
  durationMin: number;
  stops: number;
  cabin: Cabin;
  priceToman: number;
  agencyName: string;
  savedAt: number;
}

export interface Listing {
  id: string;
  originCode: string;
  originCity: string;
  destinationCode: string;
  destinationCity: string;
  airline: string;
  flightNo: string;
  departAt: number;
  arriveAt: number;
  durationMin: number;
  stops: number;
  cabin: Cabin;
  fareType: FareType;
  priceToman: number;
  bookingUrl: string;
  isActive: boolean;
  /** Set by an administrator; the listing stays hidden until lifted. */
  suspendedAt?: string | null;
  suspensionReason?: string | null;
}

export type ListingInput = Omit<Listing, "id" | "originCity" | "destinationCity" | "durationMin"> & { id?: string };

export interface AgencyStats {
  total: number;
  active: number;
  inactive: number;
  upcoming: number;
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
}

export interface ClickStats {
  days: number;
  /** First day of the window; it ends today (Iran time). */
  start: string;
  clicks: number;
  /** Distinct visitors (a visitor is re-identified daily). */
  visitors: number;
  /** Clicks in the equally long period before. */
  previousClicks: number;
  daily: { date: string; clicks: number; visitors: number }[];
  topListings: {
    /** null once the listing has been deleted. */
    listingId: string | null;
    airline: string;
    flightNo: string;
    originCode: string;
    destinationCode: string;
    departAt: number;
    clicks: number;
  }[];
  routes: { originCode: string; destinationCode: string; clicks: number }[];
  sources: { search: number; detail: number; roundtrip: number; other: number };
}

export type ImportAction = "create" | "update" | "unchanged" | "error";

export interface ImportReport {
  committed: boolean;
  counts: Record<ImportAction, number>;
  rows: {
    /** CSV line number. */
    ref: number;
    action: ImportAction;
    /** "column: CODE" */
    errors: string[];
    id?: string;
    flight?: {
      originCode: string;
      destinationCode: string;
      airline: string;
      flightNo: string;
      departAt: number;
      priceToman: number;
    };
  }[];
}

export interface ApiKey {
  id: string;
  name: string;
  /** Public part: keys look like pvz_<prefix>_<secret>. */
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface AdminStats {
  listingsTotal: number;
  listingsActive: number;
  listingsInactive: number;
  upcomingDepartures: number;
  usersTotal: number;
  agencies: number;
  regularUsers: number;
  savedFlightsTotal: number;
  topRoutes: { route: string; count: number; minPrice: number }[];
  airlineCounts: { airline: string; count: number }[];
  avgPrice: number;
}
