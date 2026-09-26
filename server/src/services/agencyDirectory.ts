import { AppDataSource } from "../database/dataSource";

/**
 * What search results show about each agency: its public address, rating and
 * verification. Kept apart from services/agencies.ts, which depends on the
 * search module this one is used by.
 */
export interface AgencyRating {
  /** One decimal. */
  average: number;
  count: number;
}

export interface AgencyCard {
  slug: string | null;
  verified: boolean;
  rating: AgencyRating | null;
}

export const round1 = (v: number) => Math.round(v * 10) / 10;

/** What search results need about each agency: its address, rating and verification. */
export async function agencyDirectory(accountIds: string[]): Promise<Map<string, AgencyCard>> {
  if (!accountIds.length) return new Map();
  const rows = (await AppDataSource.query(
    `SELECT a.id, p.slug, p.verified_at IS NOT NULL AS verified,
            avg(r.rating)::float AS average, count(r.id)::int AS count
       FROM accounts a
       LEFT JOIN agency_profiles p ON p.account_id = a.id
       LEFT JOIN agency_reviews r ON r.agency_id = a.id AND r.status = 'published'
      WHERE a.id = ANY($1)
      GROUP BY a.id, p.slug, p.verified_at`,
    [accountIds],
  )) as { id: string; slug: string | null; verified: boolean; average: number | null; count: number }[];
  return new Map(
    rows.map((r) => [
      r.id,
      {
        slug: r.slug,
        verified: r.verified,
        rating: r.count ? { average: round1(r.average ?? 0), count: r.count } : null,
      },
    ]),
  );
}
