import { getRankingWeights, type RankingMode } from "../domain/rankingWeights";
import { getAirlineReliability } from "../domain/airlineRegistry";
import { tehranHour } from "../domain/time";

/** Canonical listing shape used across the flight pipeline (JSON-safe). */
export interface Listing {
  id: string;
  accountId: string;
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
  agencyName: string;
  /** Public profile address, verification and rating, when known. */
  agencySlug?: string | null;
  agencyVerified?: boolean;
  agencyRating?: AgencyRating | null;
}

export type Cabin = "economy" | "business";

export interface AgencyRating {
  average: number;
  count: number;
}
export type FareType = "scheduled" | "charter";

/** One agency's price for a flight (a single listing). */
export interface FlightOffer {
  listingId: string;
  agencyId: string;
  agencyName: string;
  cabin: Cabin;
  fareType: FareType;
  priceToman: number;
  bookingUrl: string;
  agencySlug?: string | null;
  agencyVerified?: boolean;
  agencyRating?: AgencyRating | null;
}

/** One real-world flight, possibly sold by several agencies. */
export interface FlightCard {
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
  /** Cabin of the cheapest offer. */
  cabin: Cabin;
  bestPriceToman: number;
  priceRange: { min: number; max: number };
  /** Distinct agencies selling this flight. */
  agencyCount: number;
  /** Cheapest first. */
  offers: FlightOffer[];
  score?: number;
  scoreBreakdown?: ScoreBreakdown;
  badges?: string[];
  reasons?: ExplanationReason[];
}

export interface ScoreBreakdown {
  priceScore: number;
  durationScore: number;
  stopsScore: number;
  reliabilityScore: number;
}

export interface ExplanationReason {
  kind:
    | "cheapest"
    | "cheapest_direct"
    | "direct"
    | "fastest"
    | "fewest_stops"
    | "best_value"
    | "earliest_departure"
    | "earliest_arrival"
    | "best_agency_spread"
    | "balanced";
  text: string;
}

/** Identity of a real flight: airline + flight number + departure minute. */
export function buildFlightIdentityKey(offer: Pick<Listing, "airline" | "flightNo" | "departAt">): string {
  const departMinute = Math.floor(offer.departAt / 60_000);
  return `${offer.airline}__${offer.flightNo}__${departMinute}`;
}

/** Group listings into one card per real flight ("sold in N stores"). */
export function groupOffersByFlight(offers: Listing[]): FlightCard[] {
  const byKey = new Map<string, Listing[]>();
  for (const offer of offers) {
    const key = buildFlightIdentityKey(offer);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(offer);
    else byKey.set(key, [offer]);
  }
  return [...byKey.values()].map(buildFlightFromOffers);
}

function buildFlightFromOffers(listings: Listing[]): FlightCard {
  const sorted = [...listings].sort((a, b) => a.priceToman - b.priceToman);
  const first = sorted[0];
  const card: FlightCard = {
    id: buildFlightIdentityKey(first),
    airline: first.airline,
    flightNo: first.flightNo,
    originCode: first.originCode,
    originCity: first.originCity,
    destinationCode: first.destinationCode,
    destinationCity: first.destinationCity,
    departAt: first.departAt,
    arriveAt: first.arriveAt,
    durationMin: first.durationMin,
    stops: first.stops,
    cabin: first.cabin,
    bestPriceToman: first.priceToman,
    priceRange: { min: first.priceToman, max: first.priceToman },
    agencyCount: 0,
    offers: [],
  };
  return withOffers(
    card,
    sorted.map((l) => ({
      listingId: l.id,
      agencyId: l.accountId,
      agencyName: l.agencyName,
      cabin: l.cabin,
      fareType: l.fareType,
      priceToman: l.priceToman,
      bookingUrl: l.bookingUrl,
      ...(l.agencySlug === undefined
        ? {}
        : {
            agencySlug: l.agencySlug,
            agencyVerified: l.agencyVerified ?? false,
            agencyRating: l.agencyRating ?? null,
          }),
    })),
  );
}

/** Recompute the card's price summary for a (price-sorted, non-empty) set of offers. */
function withOffers(card: FlightCard, offers: FlightOffer[]): FlightCard {
  return {
    ...card,
    cabin: offers[0].cabin,
    bestPriceToman: offers[0].priceToman,
    priceRange: { min: offers[0].priceToman, max: offers[offers.length - 1].priceToman },
    agencyCount: new Set(offers.map((o) => o.agencyId)).size,
    offers,
  };
}

/**
 * Narrow a card to the offers matching `keep`, recomputing its price summary, or
 * drop it (null) when none match. One flight can be sold in several cabins, so
 * cabin is an offer-level property, not a card-level one.
 */
export function restrictOffers(card: FlightCard, keep: (offer: FlightOffer) => boolean): FlightCard | null {
  const offers = card.offers.filter(keep);
  if (offers.length === 0) return null;
  return offers.length === card.offers.length ? card : withOffers(card, offers);
}

export interface HourWindow {
  fromHour: number;
  toHour: number;
}

export interface SearchFilters {
  airlines?: string[];
  maxStops?: number;
  maxPriceToman?: number;
  minPriceToman?: number;
  minDurationMin?: number;
  maxDurationMin?: number;
  directOnly?: boolean;
  /** Inclusive Tehran-time hour window. */
  departWindow?: HourWindow;
  arriveWindow?: HourWindow;
  /** Offer-level: keeps only offers in this cabin. */
  cabin?: Cabin;
  /** Offer-level: keeps only charter or only scheduled offers. */
  fareType?: FareType;
}

function inWindow(epochMs: number, w: HourWindow): boolean {
  const h = tehranHour(epochMs);
  // A window like 22→4 wraps past midnight.
  return w.fromHour <= w.toHour ? h >= w.fromHour && h <= w.toHour : h >= w.fromHour || h <= w.toHour;
}

export function applyFilters(flights: FlightCard[], f: SearchFilters): FlightCard[] {
  // Offer-level filters first, so price filters below see the narrowed best price.
  const offerFiltered =
    f.cabin || f.fareType
      ? flights.flatMap(
          (card) =>
            restrictOffers(
              card,
              (o) => (!f.cabin || o.cabin === f.cabin) && (!f.fareType || o.fareType === f.fareType),
            ) ?? [],
        )
      : flights;
  return offerFiltered.filter((fl) => {
    if (f.airlines && f.airlines.length > 0 && !f.airlines.includes(fl.airline)) return false;
    if (f.maxStops !== undefined && fl.stops > f.maxStops) return false;
    if (f.directOnly && fl.stops !== 0) return false;
    if (f.maxPriceToman !== undefined && fl.bestPriceToman > f.maxPriceToman) return false;
    if (f.minPriceToman !== undefined && fl.bestPriceToman < f.minPriceToman) return false;
    if (f.maxDurationMin !== undefined && fl.durationMin > f.maxDurationMin) return false;
    if (f.minDurationMin !== undefined && fl.durationMin < f.minDurationMin) return false;
    if (f.departWindow && !inWindow(fl.departAt, f.departWindow)) return false;
    if (f.arriveWindow && !inWindow(fl.arriveAt, f.arriveWindow)) return false;
    return true;
  });
}

export const SORT_MODES = ["best", "cheapest", "fastest", "departure", "arrival"] as const;
export type SortMode = (typeof SORT_MODES)[number];

/**
 * Order an already-ranked set. "best" uses the score attached by `rankFlights`
 * (so the ranking mode chosen there is respected).
 */
/**
 * Round trips: flights that can pair with the other leg's choice first, the rest
 * after (the page marks them unavailable), each group keeping its order.
 * `departFrom`: earliest departure that still follows the chosen outbound;
 * `arriveBy`: latest arrival that still precedes the chosen return.
 */
export function pairableFirst(
  flights: FlightCard[],
  { departFrom, arriveBy }: { departFrom?: number; arriveBy?: number },
): FlightCard[] {
  if (departFrom === undefined && arriveBy === undefined) return flights;
  const fits = (f: FlightCard) =>
    (departFrom === undefined || f.departAt >= departFrom) && (arriveBy === undefined || f.arriveAt <= arriveBy);
  return [...flights.filter(fits), ...flights.filter((f) => !fits(f))];
}

export function sortFlights(flights: FlightCard[], sort: SortMode = "best"): FlightCard[] {
  const arr = [...flights];
  switch (sort) {
    case "cheapest":
      return arr.sort((a, b) => a.bestPriceToman - b.bestPriceToman || a.departAt - b.departAt);
    case "fastest":
      return arr.sort((a, b) => a.durationMin - b.durationMin || a.bestPriceToman - b.bestPriceToman);
    case "departure":
      return arr.sort((a, b) => a.departAt - b.departAt);
    case "arrival":
      return arr.sort((a, b) => a.arriveAt - b.arriveAt);
    case "best":
      return arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
}

function minMaxNormalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

function scoreForStops(stops: number): number {
  if (stops === 0) return 1;
  if (stops === 1) return 0.5;
  return 0.2;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface Scored {
  score: number;
  breakdown: ScoreBreakdown;
}

export interface ResultBounds {
  minPrice: number;
  maxPrice: number;
  minDuration: number;
  maxDuration: number;
}

export function resultBounds(flights: FlightCard[]): ResultBounds {
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let minDuration = Infinity;
  let maxDuration = -Infinity;
  for (const f of flights) {
    minPrice = Math.min(minPrice, f.bestPriceToman);
    maxPrice = Math.max(maxPrice, f.bestPriceToman);
    minDuration = Math.min(minDuration, f.durationMin);
    maxDuration = Math.max(maxDuration, f.durationMin);
  }
  return { minPrice, maxPrice, minDuration, maxDuration };
}

/** Score one flight against the result set's bounds (0..1, higher = better). */
export function computeScore(flight: FlightCard, bounds: ResultBounds, mode: RankingMode = "relevance"): Scored {
  const weights = getRankingWeights(mode);
  const priceScore = 1 - minMaxNormalize(flight.bestPriceToman, bounds.minPrice, bounds.maxPrice);
  const durationScore = 1 - minMaxNormalize(flight.durationMin, bounds.minDuration, bounds.maxDuration);
  const stopsScore = scoreForStops(flight.stops);
  const reliabilityScore = getAirlineReliability(flight.airline);
  const total =
    priceScore * weights.price +
    durationScore * weights.duration +
    stopsScore * weights.stops +
    reliabilityScore * weights.reliability;
  return {
    score: roundTo(total, 4),
    breakdown: {
      priceScore: roundTo(priceScore, 2),
      durationScore: roundTo(durationScore, 2),
      stopsScore: roundTo(stopsScore, 2),
      reliabilityScore: roundTo(reliabilityScore, 2),
    },
  };
}

/** Compute + attach score/badges/reasons to every flight; returns them best-first. */
export function rankFlights(flights: FlightCard[], mode: RankingMode = "relevance"): FlightCard[] {
  if (flights.length === 0) return flights;

  const bounds = resultBounds(flights);
  const cheapest = bounds.minPrice;
  const fastest = bounds.minDuration;
  let cheapestDirect: number | null = null;
  let fastestDirect: number | null = null;
  let earliestDeparture = Infinity;
  let earliestArrival = Infinity;
  let maxAgencyCount = 0;
  for (const f of flights) {
    if (f.stops === 0) {
      cheapestDirect = Math.min(cheapestDirect ?? Infinity, f.bestPriceToman);
      fastestDirect = Math.min(fastestDirect ?? Infinity, f.durationMin);
    }
    earliestDeparture = Math.min(earliestDeparture, f.departAt);
    earliestArrival = Math.min(earliestArrival, f.arriveAt);
    maxAgencyCount = Math.max(maxAgencyCount, f.agencyCount);
  }

  return flights
    .map((f) => {
      const { score, breakdown } = computeScore(f, bounds, mode);
      const badges: string[] = [];
      const reasons: ExplanationReason[] = [];

      if (f.bestPriceToman === cheapest) {
        badges.push("ارزان‌ترین");
        reasons.push({ kind: "cheapest", text: "ارزان‌ترین گزینه در میان همه نتایج این جستجوست" });
      }
      if (f.stops === 0) {
        badges.push("مستقیم");
        if (cheapestDirect !== null && f.bestPriceToman === cheapestDirect && f.bestPriceToman !== cheapest) {
          reasons.push({ kind: "cheapest_direct", text: "ارزان‌ترین پرواز مستقیم این مسیر است" });
        }
        if (fastestDirect !== null && f.durationMin === fastestDirect && f.durationMin !== fastest) {
          reasons.push({ kind: "fastest", text: "سریع‌ترین پرواز مستقیم این مسیر است" });
        }
        if (reasons.length === 0) {
          reasons.push({ kind: "direct", text: "بدون توقف به مقصد می‌رسد" });
        }
      }
      if (f.durationMin === fastest) {
        badges.push("سریع‌ترین");
        if (!reasons.some((r) => r.kind === "fastest")) {
          reasons.unshift({ kind: "fastest", text: "کوتاه‌ترین زمان پرواز را در میان همه گزینه‌ها دارد" });
        }
      }
      if (f.agencyCount === maxAgencyCount && f.agencyCount > 1) {
        reasons.push({
          kind: "best_agency_spread",
          text: `در ${f.agencyCount} آژانس عرضه شده و ارزان‌ترین قیمت آن نمایش داده شده است`,
        });
      }
      if (f.departAt === earliestDeparture && f.stops === 0) {
        reasons.push({ kind: "earliest_departure", text: "زودترین ساعت حرکت مستقیم را دارد" });
      }
      if (f.arriveAt === earliestArrival) {
        reasons.push({ kind: "earliest_arrival", text: "زودتر از همه به مقصد می‌رسد" });
      }

      return { ...f, score, scoreBreakdown: breakdown, badges, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
