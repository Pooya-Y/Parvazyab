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
  email: string;
  role: AccountRole;
  accountRole: "agency" | "user";
  agencyName?: string | null;
  createdAt: string;
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
