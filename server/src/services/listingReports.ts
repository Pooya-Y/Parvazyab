/**
 * Travellers flag an agency's offer that doesn't match what the agency's site
 * says: the price, availability, the flight's details, a dead link. Reports
 * gather per offer for administrators, who suspend the offer or dismiss the
 * reports; either way each reporter hears how it ended.
 */
import type { Request } from "express";
import { AppDataSource } from "../database/dataSource";
import type { Account } from "../database/entities";
import { cityName } from "../domain/format";
import { tehranTodayKey } from "../domain/time";
import { HttpError, notFound } from "../http/errors";
import { audit } from "./audit";
import { notify } from "./notifications";
import { VISIBLE_LISTING_SQL } from "./visibility";

export const REPORT_REASONS = ["price_mismatch", "unavailable", "wrong_details", "broken_link", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Reports one person may file in a day, across all offers. */
const DAILY_REPORTS = 30;
/** Notes shown per offer in the admin queue. */
const NOTES_SHOWN = 5;

export interface ReportInput {
  reason: ReportReason;
  /** What the agency's site asked, for a price mismatch. */
  observedPrice: number | null;
  note: string;
}

/** Files a report on an offer travellers can see; reporting the same offer again updates the open report. */
export async function reportListing(
  user: Account,
  listingId: string,
  input: ReportInput,
): Promise<"created" | "updated"> {
  const [listing] = (await AppDataSource.query(
    `SELECT f.account_id AS "accountId" FROM flight_listings f WHERE f.id = $1 AND ${VISIBLE_LISTING_SQL}`,
    [listingId],
  )) as { accountId: string }[];
  if (!listing) throw notFound();
  if (listing.accountId === user.id) throw new HttpError(400, "CANNOT_REPORT_OWN_LISTING");
  const [{ recent }] = (await AppDataSource.query(
    `SELECT count(*)::int AS recent FROM listing_reports WHERE reporter_id = $1 AND created_at > now() - interval '1 day'`,
    [user.id],
  )) as { recent: number }[];
  if (recent >= DAILY_REPORTS) throw new HttpError(429, "REPORT_LIMIT");
  const [row] = (await AppDataSource.query(
    `INSERT INTO listing_reports (listing_id, reporter_id, reason, observed_price, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (listing_id, reporter_id) WHERE resolved_at IS NULL
     DO UPDATE SET reason = EXCLUDED.reason, observed_price = EXCLUDED.observed_price,
                   note = EXCLUDED.note, created_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [listingId, user.id, input.reason, input.observedPrice, input.note],
  )) as { inserted: boolean }[];
  return row.inserted ? "created" : "updated";
}

/**
 * Closes an offer's open reports and tells each reporter how it ended. Called
 * when an administrator suspends the offer (however they got there) or
 * dismisses its reports. Returns how many reports were closed.
 */
export async function resolveListingReports(listingId: string, resolution: "suspended" | "dismissed"): Promise<number> {
  const closed = (await AppDataSource.query(
    `WITH closed AS (
       UPDATE listing_reports SET resolved_at = now(), resolution = $2
        WHERE listing_id = $1 AND resolved_at IS NULL
        RETURNING reporter_id
     )
     SELECT reporter_id AS "reporterId" FROM closed`,
    [listingId, resolution],
  )) as { reporterId: string }[];
  if (!closed.length) return 0;

  const [listing] = (await AppDataSource.query(
    `SELECT f.flight_no AS "flightNo", f.origin_code AS "originCode", f.destination_code AS "destinationCode",
            f.depart_at AS "departAt", COALESCE(NULLIF(a.agency_name, ''), a.name) AS "agencyName"
       FROM flight_listings f JOIN accounts a ON a.id = f.account_id
      WHERE f.id = $1`,
    [listingId],
  )) as { flightNo: string; originCode: string; destinationCode: string; departAt: Date; agencyName: string }[];
  const flight = `${listing.flightNo} ${cityName(listing.originCode)} به ${cityName(listing.destinationCode)}`;
  const body =
    resolution === "suspended"
      ? `پیشنهاد «${listing.agencyName}» برای پرواز ${flight} از نتایج برداشته شد. ممنون که خبر دادید.`
      : `پیشنهاد «${listing.agencyName}» برای پرواز ${flight} را بررسی کردیم و مشکلی در آن پیدا نکردیم. ممنون که خبر دادید.`;
  // Where to look for another offer for the same flight day.
  const link = `/search?${new URLSearchParams({
    from: listing.originCode,
    to: listing.destinationCode,
    date: tehranTodayKey(listing.departAt.getTime()),
  })}`;
  for (const { reporterId } of closed) {
    await notify(
      { id: reporterId, name: "", email: null, emailVerifiedAt: null },
      { kind: "moderation", title: "گزارش شما بررسی شد", body, link },
    );
  }
  return closed.length;
}

/** The reports weren't borne out: close them and keep the offer. */
export async function dismissListingReports(actor: Account, listingId: string, req: Request) {
  const closed = await resolveListingReports(listingId, "dismissed");
  if (!closed) return;
  await audit(req, {
    actorId: actor.id,
    action: "admin.listing_reports_dismissed",
    targetType: "listing",
    targetId: listingId,
    details: { reports: closed },
  });
}

interface QueueRow {
  listingId: string;
  airline: string;
  flightNo: string;
  originCode: string;
  destinationCode: string;
  departAt: Date;
  priceToman: string;
  bookingUrl: string;
  agencyName: string;
  agencySlug: string | null;
  reports: { reason: ReportReason; note: string; observedPrice: number | null; at: string }[];
}

/** Offers with open reports that travellers can still see, the most reported first. */
export async function reportedListings() {
  const rows = (await AppDataSource.query(
    `SELECT f.id AS "listingId", f.airline, f.flight_no AS "flightNo", f.origin_code AS "originCode",
            f.destination_code AS "destinationCode", f.depart_at AS "departAt", f.price_toman AS "priceToman",
            f.booking_url AS "bookingUrl", COALESCE(NULLIF(a.agency_name, ''), a.name) AS "agencyName",
            p.slug AS "agencySlug",
            jsonb_agg(
              jsonb_build_object('reason', r.reason, 'note', r.note, 'observedPrice', r.observed_price, 'at', r.created_at)
              ORDER BY r.created_at DESC
            ) AS reports
       FROM listing_reports r
       JOIN flight_listings f ON f.id = r.listing_id
       JOIN accounts a ON a.id = f.account_id
       LEFT JOIN agency_profiles p ON p.account_id = f.account_id
      WHERE r.resolved_at IS NULL AND ${VISIBLE_LISTING_SQL}
      GROUP BY f.id, a.agency_name, a.name, p.slug
      ORDER BY count(*) DESC, max(r.created_at) DESC
      LIMIT 100`,
  )) as QueueRow[];

  return rows.map(({ reports, departAt, priceToman, ...listing }) => {
    const counts = new Map<ReportReason, number>();
    for (const r of reports) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    return {
      ...listing,
      departAt: departAt.getTime(),
      priceToman: Number(priceToman),
      reports: reports.length,
      lastReportedAt: new Date(reports[0].at).getTime(),
      reasons: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      notes: reports
        .filter((r) => r.note || r.observedPrice)
        .slice(0, NOTES_SHOWN)
        .map((r) => ({
          reason: r.reason,
          note: r.note,
          observedPrice: r.observedPrice === null ? null : Number(r.observedPrice),
          at: new Date(r.at).getTime(),
        })),
    };
  });
}
