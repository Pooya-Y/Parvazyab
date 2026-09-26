import { randomBytes } from "node:crypto";
import { AppDataSource } from "../database/dataSource";
import type { Account } from "../database/entities";
import { isGuestAccount } from "../auth/auth";
import { HttpError, notFound } from "../http/errors";
import { invalidate } from "./redis";
import { SEARCH_CACHE_PREFIX } from "./flightService";
import { VISIBLE_LISTING_SQL } from "./visibility";
import { round1 } from "./agencyDirectory";

/**
 * Public agency profiles and travellers' reviews. An agency's rating is the
 * mean of its published reviews; lists rank by a credibility-adjusted mean, so
 * a single 5★ review doesn't outrank two hundred reviews averaging 4.8.
 */
export const SLUG_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(["new", "edit", "admin", "api", "me", "search", "all", "agency", "agencies"]);

/** Bayesian prior: as if every agency started with PRIOR_WEIGHT reviews of PRIOR_MEAN. */
const PRIOR_MEAN = 4;
const PRIOR_WEIGHT = 5;

/** "سارا کاظمی" → "سارا ک.": enough to be human, not enough to find the person. */
export function reviewerName(name: string): string {
  const [first, second] = name.trim().split(/\s+/);
  if (!first) return "مسافر";
  return second ? `${first} ${second[0]}.` : first;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** Every agency has a profile; new ones start with a placeholder address the agency can change. */
export async function ensureAgencyProfile(accountId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO agency_profiles (account_id, slug) VALUES ($1, $2) ON CONFLICT (account_id) DO NOTHING`,
    [accountId, `agency-${randomBytes(4).toString("hex")}`],
  );
}

interface DirectoryRow {
  slug: string;
  name: string;
  city: string | null;
  verified: boolean;
  average: number | null;
  count: number;
  listings: number;
}

/** Agencies with something to offer, best-rated (credibly) first. */
export async function listAgencies() {
  const rows = (await AppDataSource.query(
    `SELECT p.slug, COALESCE(NULLIF(a.agency_name, ''), a.name) AS name, p.city,
            p.verified_at IS NOT NULL AS verified,
            (SELECT avg(rating)::float FROM agency_reviews r WHERE r.agency_id = a.id AND r.status = 'published') AS average,
            (SELECT count(*)::int FROM agency_reviews r WHERE r.agency_id = a.id AND r.status = 'published') AS count,
            (SELECT count(*)::int FROM flight_listings f WHERE f.account_id = a.id AND ${VISIBLE_LISTING_SQL}) AS listings
       FROM agency_profiles p
       JOIN accounts a ON a.id = p.account_id AND a.role = 'agency'`,
  )) as DirectoryRow[];
  const score = (r: DirectoryRow) =>
    (PRIOR_MEAN * PRIOR_WEIGHT + (r.average ?? 0) * r.count) / (PRIOR_WEIGHT + r.count);
  return rows
    .filter((r) => r.listings > 0 || r.count > 0)
    .sort((a, b) => Number(b.verified) - Number(a.verified) || score(b) - score(a) || b.listings - a.listings)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      city: r.city,
      verified: r.verified,
      rating: r.count ? { average: round1(r.average ?? 0), count: r.count } : null,
      listings: r.listings,
    }));
}

interface ProfileRow {
  accountId: string;
  slug: string;
  name: string;
  description: string;
  website: string | null;
  supportPhone: string | null;
  city: string | null;
  licenseNo: string | null;
  verified: boolean;
  since: Date;
}

async function profileRow(where: "slug" | "account", value: string): Promise<ProfileRow | null> {
  const [row] = (await AppDataSource.query(
    `SELECT p.account_id AS "accountId", p.slug, COALESCE(NULLIF(a.agency_name, ''), a.name) AS name,
            p.description, p.website, p.support_phone AS "supportPhone", p.city, p.license_no AS "licenseNo",
            p.verified_at IS NOT NULL AS verified, a.created_at AS since
       FROM agency_profiles p
       JOIN accounts a ON a.id = p.account_id AND a.role = 'agency'
      WHERE ${where === "slug" ? "p.slug" : "p.account_id"} = $1`,
    [value],
  )) as ProfileRow[];
  return row ?? null;
}

export async function agencyIdBySlug(slug: string): Promise<string> {
  const row = await profileRow("slug", slug);
  if (!row) throw notFound();
  return row.accountId;
}

/** The public profile: details, rating summary, and the routes the agency flies now. */
export async function agencyProfile(slug: string) {
  const profile = await profileRow("slug", slug);
  if (!profile) throw notFound();
  const [[rating], routes] = (await Promise.all([
    AppDataSource.query(
      `SELECT avg(rating)::float AS average, count(*)::int AS count,
              count(*) FILTER (WHERE rating = 1)::int AS r1, count(*) FILTER (WHERE rating = 2)::int AS r2,
              count(*) FILTER (WHERE rating = 3)::int AS r3, count(*) FILTER (WHERE rating = 4)::int AS r4,
              count(*) FILTER (WHERE rating = 5)::int AS r5
         FROM agency_reviews WHERE agency_id = $1 AND status = 'published'`,
      [profile.accountId],
    ),
    AppDataSource.query(
      `SELECT f.origin_code AS "originCode", f.destination_code AS "destinationCode",
              min(f.price_toman)::bigint AS "minPrice", count(*)::int AS flights
         FROM flight_listings f
        WHERE f.account_id = $1 AND ${VISIBLE_LISTING_SQL}
        GROUP BY f.origin_code, f.destination_code
        ORDER BY flights DESC, "minPrice"
        LIMIT 12`,
      [profile.accountId],
    ),
  ])) as [
    { average: number | null; count: number; r1: number; r2: number; r3: number; r4: number; r5: number }[],
    { originCode: string; destinationCode: string; minPrice: string; flights: number }[],
  ];
  const { accountId, since, ...details } = profile;
  return {
    ...details,
    agencyId: accountId,
    since: since.getTime(),
    rating: {
      average: rating.count ? round1(rating.average ?? 0) : null,
      count: rating.count,
      /** Reviews per star, 1★ first. */
      histogram: [rating.r1, rating.r2, rating.r3, rating.r4, rating.r5],
    },
    routes: routes.map((r) => ({ ...r, minPrice: Number(r.minPrice) })),
  };
}

export interface ProfileInput {
  slug: string;
  description: string;
  website: string | null;
  supportPhone: string | null;
  city: string | null;
  licenseNo: string | null;
}

export async function ownProfile(accountId: string) {
  await ensureAgencyProfile(accountId);
  const row = await profileRow("account", accountId);
  if (!row) throw notFound();
  const { accountId: _id, since: _since, ...details } = row;
  return details;
}

export async function updateAgencyProfile(accountId: string, input: ProfileInput) {
  if (RESERVED_SLUGS.has(input.slug)) throw new HttpError(409, "SLUG_TAKEN");
  await ensureAgencyProfile(accountId);
  try {
    await AppDataSource.query(
      `UPDATE agency_profiles
          SET slug = $2, description = $3, website = $4, support_phone = $5, city = $6, license_no = $7,
              updated_at = now()
        WHERE account_id = $1`,
      [accountId, input.slug, input.description, input.website, input.supportPhone, input.city, input.licenseNo],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new HttpError(409, "SLUG_TAKEN");
    throw err;
  }
  // Offers in cached search results carry the agency's address.
  await invalidate(SEARCH_CACHE_PREFIX);
  return ownProfile(accountId);
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

interface ReviewRow {
  id: string;
  rating: number;
  body: string;
  authorId: string;
  authorName: string;
  status: "published" | "hidden";
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeReview(r: ReviewRow, viewerId?: string) {
  return {
    id: r.id,
    rating: r.rating,
    body: r.body,
    author: reviewerName(r.authorName),
    mine: viewerId === r.authorId,
    edited: r.updatedAt.getTime() - r.createdAt.getTime() > 60_000,
    reply: r.reply,
    repliedAt: r.repliedAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
  };
}

const REVIEW_COLUMNS = `r.id, r.rating, r.body, r.author_id AS "authorId", u.name AS "authorName", r.status,
  r.reply, r.replied_at AS "repliedAt", r.created_at AS "createdAt", r.updated_at AS "updatedAt"`;

/** Published reviews, newest first; `before` (epoch ms) pages back. The viewer's own review is flagged. */
export async function listReviews(
  agencyId: string,
  { limit, before, viewerId }: { limit: number; before?: number; viewerId?: string },
) {
  const params: unknown[] = [agencyId, limit];
  const older = before === undefined ? "" : `AND r.created_at < $${params.push(new Date(before))}`;
  const rows = (await AppDataSource.query(
    `SELECT ${REVIEW_COLUMNS}
       FROM agency_reviews r JOIN accounts u ON u.id = r.author_id
      WHERE r.agency_id = $1 AND r.status = 'published' ${older}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $2`,
    params,
  )) as ReviewRow[];
  return rows.map((r) => serializeReview(r, viewerId));
}

/** The viewer's own review of an agency, whatever its status (so a hidden one can still be edited). */
export async function myReview(agencyId: string, viewerId: string) {
  const [row] = (await AppDataSource.query(
    `SELECT ${REVIEW_COLUMNS} FROM agency_reviews r JOIN accounts u ON u.id = r.author_id
      WHERE r.agency_id = $1 AND r.author_id = $2`,
    [agencyId, viewerId],
  )) as ReviewRow[];
  return row ? { ...serializeReview(row, viewerId), hidden: row.status === "hidden" } : null;
}

/**
 * Who may review: a traveller (not an agency or admin, not a guest) whose email
 * or phone is verified, so a review stands for a reachable person.
 */
function assertCanReview(user: Account, agencyId: string) {
  if (user.id === agencyId || user.role !== "user") throw new HttpError(403, "AGENCIES_CANNOT_REVIEW");
  if (isGuestAccount(user)) throw new HttpError(403, "GUEST_ACCOUNT");
  if (!user.emailVerifiedAt && !user.phoneVerifiedAt) throw new HttpError(403, "REVIEW_NEEDS_VERIFIED_ACCOUNT");
}

/** One review per traveller per agency: writing again edits it. A hidden review stays hidden. */
export async function upsertReview(user: Account, agencyId: string, input: { rating: number; body: string }) {
  assertCanReview(user, agencyId);
  await AppDataSource.query(
    `INSERT INTO agency_reviews (agency_id, author_id, rating, body) VALUES ($1, $2, $3, $4)
     ON CONFLICT (agency_id, author_id)
     DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now()`,
    [agencyId, user.id, input.rating, input.body],
  );
  await invalidate(SEARCH_CACHE_PREFIX);
  return myReview(agencyId, user.id);
}

export async function deleteMyReview(user: Account, agencyId: string) {
  const [row] = (await AppDataSource.query(
    `WITH gone AS (DELETE FROM agency_reviews WHERE agency_id = $1 AND author_id = $2 RETURNING 1) SELECT 1 FROM gone`,
    [agencyId, user.id],
  )) as unknown[];
  if (!row) throw notFound();
  await invalidate(SEARCH_CACHE_PREFIX);
}

/** For the agency's dashboard: every review of it, hidden ones flagged, newest first. */
export async function reviewsForAgency(agencyId: string) {
  const rows = (await AppDataSource.query(
    `SELECT ${REVIEW_COLUMNS} FROM agency_reviews r JOIN accounts u ON u.id = r.author_id
      WHERE r.agency_id = $1 ORDER BY r.created_at DESC LIMIT 200`,
    [agencyId],
  )) as ReviewRow[];
  return rows.map((r) => ({ ...serializeReview(r), hidden: r.status === "hidden" }));
}

/** The agency's public answer to a review of it; an empty reply removes it. */
export async function replyToReview(agencyId: string, reviewId: string, reply: string) {
  const [row] = (await AppDataSource.query(
    `WITH updated AS (
       UPDATE agency_reviews SET reply = NULLIF($3, ''), replied_at = CASE WHEN $3 = '' THEN NULL ELSE now() END
        WHERE id = $2 AND agency_id = $1 RETURNING 1
     )
     SELECT 1 FROM updated`,
    [agencyId, reviewId, reply],
  )) as unknown[];
  if (!row) throw notFound();
}
