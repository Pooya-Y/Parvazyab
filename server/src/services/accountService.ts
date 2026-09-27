import { accounts, flightListings, savedFlights, isUniqueViolation } from "../database/dataSource";
import { ensureAgencyProfile } from "./agencies";
import type { Account, FlightListing, SavedFlight } from "../database/entities";
import { findAirport } from "../domain/airports";
import { resolveCanonicalAirlineName } from "../domain/airlineRegistry";
import { HttpError, notFound } from "../http/errors";
import type { ListingInput, SavedFlightSnapshot } from "../api/schemas";
import { invalidate } from "./redis";
import { SEARCH_CACHE_PREFIX } from "./flightService";

// ---------------------------------------------------------------------------
// Serialization: dates as epoch ms, same convention as search results.
// ---------------------------------------------------------------------------

export function serializeSavedFlight(r: SavedFlight) {
  const { accountId: _owner, ...rest } = r;
  return { ...rest, departAt: r.departAt.getTime(), arriveAt: r.arriveAt.getTime(), savedAt: r.savedAt.getTime() };
}

export function serializeListing(r: FlightListing) {
  return { ...r, departAt: r.departAt.getTime(), arriveAt: r.arriveAt.getTime() };
}

// ---------------------------------------------------------------------------
// Saved flights
// ---------------------------------------------------------------------------

export async function listSavedFlights(accountId: string) {
  const rows = await savedFlights().find({ where: { accountId }, order: { savedAt: "DESC" } });
  return rows.map(serializeSavedFlight);
}

/** Idempotent: saving an already-saved flight returns the existing row. */
export async function saveFlight(
  accountId: string,
  s: SavedFlightSnapshot,
): Promise<{ row: SavedFlight; created: boolean }> {
  const repo = savedFlights();
  const existing = await repo.findOne({ where: { accountId, flightKey: s.id } });
  if (existing) return { row: existing, created: false };
  try {
    const row = await repo.save(
      repo.create({
        accountId,
        flightKey: s.id,
        airline: s.airline,
        flightNo: s.flightNo,
        originCode: s.originCode,
        originCity: s.originCity,
        destinationCode: s.destinationCode,
        destinationCity: s.destinationCity,
        departAt: new Date(s.departAt),
        arriveAt: new Date(s.arriveAt),
        durationMin: s.durationMin,
        stops: s.stops,
        cabin: s.cabin,
        priceToman: Math.round(s.bestPriceToman),
        agencyName: s.agencyName,
      }),
    );
    return { row, created: true };
  } catch (err) {
    // A concurrent request (double click) inserted it first.
    if (!isUniqueViolation(err)) throw err;
    const row = await repo.findOneOrFail({ where: { accountId, flightKey: s.id } });
    return { row, created: false };
  }
}

export async function unsaveFlight(accountId: string, flightKey: string) {
  await savedFlights().delete({ accountId, flightKey });
}

// ---------------------------------------------------------------------------
// Agency listings
// ---------------------------------------------------------------------------

/** Validated input → stored columns: canonical airline and airport cities, derived duration. */
export function toListingColumns(b: ListingInput) {
  if (b.originCode === b.destinationCode) throw new HttpError(400, "SAME_ORIGIN_DESTINATION");
  if (b.arriveAt <= b.departAt) throw new HttpError(400, "ARRIVAL_BEFORE_DEPARTURE");
  const origin = findAirport(b.originCode);
  const destination = findAirport(b.destinationCode);
  if (!origin || !destination) throw new HttpError(400, "UNKNOWN_AIRPORT");
  return {
    originCode: origin.code,
    originCity: origin.city,
    destinationCode: destination.code,
    destinationCity: destination.city,
    airline: resolveCanonicalAirlineName(b.airline),
    flightNo: b.flightNo.toUpperCase(),
    departAt: new Date(b.departAt),
    arriveAt: new Date(b.arriveAt),
    durationMin: Math.max(1, Math.round((b.arriveAt - b.departAt) / 60_000)),
    stops: b.stops,
    cabin: b.cabin,
    fareType: b.fareType,
    priceToman: Math.round(b.priceToman),
    bookingUrl: b.bookingUrl,
    isActive: b.isActive,
  };
}

export type ListingColumns = ReturnType<typeof toListingColumns>;

export async function listListings(accountId: string) {
  const rows = await flightListings().find({ where: { accountId }, order: { departAt: "DESC" } });
  return rows.map(serializeListing);
}

/** Create, or update when `input.id` is an existing listing owned by this account. */
export async function upsertListing(accountId: string, input: ListingInput): Promise<{ id: string; created: boolean }> {
  const columns = toListingColumns(input);
  const repo = flightListings();
  let result: { id: string; created: boolean };
  if (input.id) {
    const existing = await repo.findOne({ where: { id: input.id, accountId } });
    if (!existing) throw notFound();
    await repo.update({ id: existing.id }, columns);
    result = { id: existing.id, created: false };
  } else {
    const row = await repo.save(repo.create({ ...columns, accountId }));
    result = { id: row.id, created: true };
  }
  await invalidate(SEARCH_CACHE_PREFIX);
  return result;
}

export async function setListingActive(accountId: string, id: string, isActive: boolean) {
  const res = await flightListings().update({ id, accountId }, { isActive });
  if (!res.affected) throw notFound();
  await invalidate(SEARCH_CACHE_PREFIX);
}

export async function deleteListing(accountId: string, id: string) {
  const res = await flightListings().delete({ id, accountId });
  if (!res.affected) throw notFound();
  await invalidate(SEARCH_CACHE_PREFIX);
}

type NumericRow = Record<string, string | number | null>;
const num = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export async function agencyStats(accountId: string) {
  const [row] = (await flightListings().query(
    `SELECT count(*)                                              AS total,
            count(*) FILTER (WHERE is_active)                     AS active,
            count(*) FILTER (WHERE is_active AND depart_at > now()) AS upcoming,
            min(price_toman) FILTER (WHERE is_active)             AS min_price,
            round(avg(price_toman) FILTER (WHERE is_active))      AS avg_price,
            max(price_toman) FILTER (WHERE is_active)             AS max_price
       FROM flight_listings WHERE account_id = $1`,
    [accountId],
  )) as NumericRow[];
  const total = num(row.total);
  const active = num(row.active);
  return {
    total,
    active,
    inactive: total - active,
    upcoming: num(row.upcoming),
    minPrice: num(row.min_price),
    avgPrice: num(row.avg_price),
    maxPrice: num(row.max_price),
  };
}

/** Returns whether the account changed (agencies and admins are left as they are). */
export async function becomeAgency(user: Account, agencyName: string): Promise<boolean> {
  if (user.role !== "user") return false;
  await accounts().update({ id: user.id }, { role: "agency", agencyName });
  await ensureAgencyProfile(user.id);
  return true;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminStats() {
  const listingRepo = flightListings();
  const [[listings], [users], [saved], topRoutes, airlineCounts] = (await Promise.all([
    listingRepo.query(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE is_active) AS active,
              count(*) FILTER (WHERE is_active AND depart_at > now()) AS upcoming,
              round(avg(price_toman) FILTER (WHERE is_active)) AS avg_price
         FROM flight_listings`,
    ),
    listingRepo.query(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE role = 'agency') AS agencies,
              count(*) FILTER (WHERE role = 'user') AS regular
         FROM accounts`,
    ),
    listingRepo.query(`SELECT count(*) AS total FROM saved_flights`),
    listingRepo.query(
      `SELECT origin_code || '-' || destination_code AS route, count(*) AS count, min(price_toman) AS min_price
         FROM flight_listings WHERE is_active
        GROUP BY origin_code, destination_code
        ORDER BY count(*) DESC LIMIT 8`,
    ),
    listingRepo.query(
      `SELECT airline, count(*) AS count FROM flight_listings WHERE is_active
        GROUP BY airline ORDER BY count(*) DESC`,
    ),
  ])) as NumericRow[][];
  const listingsTotal = num(listings.total);
  const listingsActive = num(listings.active);
  return {
    listingsTotal,
    listingsActive,
    listingsInactive: listingsTotal - listingsActive,
    upcomingDepartures: num(listings.upcoming),
    usersTotal: num(users.total),
    agencies: num(users.agencies),
    regularUsers: num(users.regular),
    savedFlightsTotal: num(saved.total),
    topRoutes: topRoutes.map((r) => ({ route: String(r.route), count: num(r.count), minPrice: num(r.min_price) })),
    airlineCounts: airlineCounts.map((r) => ({ airline: String(r.airline), count: num(r.count) })),
    avgPrice: num(listings.avg_price),
  };
}

/** Returns the previous role. */
export async function setAccountRole(actor: Account, targetId: string, role: "user" | "agency") {
  if (actor.id === targetId) throw new HttpError(400, "CANNOT_CHANGE_OWN_ROLE");
  const target = await accounts().findOne({ where: { id: targetId } });
  if (!target) throw notFound();
  if (target.role === "admin") throw new HttpError(403, "CANNOT_CHANGE_ADMIN");
  await accounts().update({ id: targetId }, { role });
  if (role === "agency") await ensureAgencyProfile(targetId);
  return target.role;
}
