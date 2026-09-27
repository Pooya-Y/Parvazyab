import type { NextFunction, Request, Response } from "express";
import { AppDataSource, accounts, flightListings } from "../database/dataSource";
import type { Account } from "../database/entities";
import { isGuestAccount, sessionUser } from "../auth/auth";
import { cityName } from "../domain/format";
import { HttpError, notFound } from "../http/errors";
import { audit, type AuditAction } from "./audit";
import { notify } from "./notifications";
import { reviewerName } from "./agencies";
import { invalidate } from "./redis";
import { SEARCH_CACHE_PREFIX } from "./flightService";
import { reportedListings, resolveListingReports } from "./listingReports";

/**
 * Moderation: what administrators can hide, and what gets brought to their
 * attention. Every decision is audited, and the account concerned is told
 * (in-app) what happened and why.
 */

/** Suspended accounts can sign in, but not publish, import, review or create alerts. */
export function forbidSuspended(_req: Request, res: Response, next: NextFunction) {
  if (sessionUser(res).suspendedAt) throw new HttpError(403, "ACCOUNT_SUSPENDED");
  next();
}

const tell = (accountId: string, title: string, body: string, link: string | null) =>
  notify({ id: accountId, name: "", email: null, emailVerifiedAt: null }, { kind: "moderation", title, body, link });

// ---------------------------------------------------------------------------
// Suspensions
// ---------------------------------------------------------------------------

export async function setAccountSuspension(
  actor: Account,
  targetId: string,
  { suspended, reason }: { suspended: boolean; reason: string | null },
  req: Request,
) {
  if (actor.id === targetId) throw new HttpError(400, "CANNOT_SUSPEND_SELF");
  const target = await accounts().findOne({ where: { id: targetId } });
  if (!target) throw notFound();
  if (target.role === "admin") throw new HttpError(403, "CANNOT_SUSPEND_ADMIN");
  if (Boolean(target.suspendedAt) === suspended) return;
  await accounts().update(targetId, {
    suspendedAt: suspended ? new Date() : null,
    suspensionReason: suspended ? reason : null,
  });
  // An agency's listings disappear from (or return to) every public view at once.
  await invalidate(SEARCH_CACHE_PREFIX);
  await audit(req, {
    actorId: actor.id,
    action: suspended ? "admin.account_suspended" : "admin.account_restored",
    targetType: "account",
    targetId,
    details: suspended ? { reason } : {},
  });
  await tell(
    targetId,
    suspended ? "حساب شما معلق شد" : "تعلیق حساب شما برداشته شد",
    suspended
      ? `تا بررسی دوباره، انتشار پرواز، ثبت نظر و ساختن هشدار برای این حساب ممکن نیست.${reason ? ` دلیل: ${reason}` : ""}`
      : "همهٔ امکانات حساب دوباره در دسترس است.",
    "/dashboard",
  );
}

export async function setListingSuspension(
  actor: Account,
  listingId: string,
  { suspended, reason }: { suspended: boolean; reason: string | null },
  req: Request,
) {
  const listing = await flightListings().findOne({ where: { id: listingId } });
  if (!listing) throw notFound();
  if (Boolean(listing.suspendedAt) === suspended) return;
  await flightListings().update(listingId, {
    suspendedAt: suspended ? new Date() : null,
    suspensionReason: suspended ? reason : null,
  });
  await invalidate(SEARCH_CACHE_PREFIX);
  const flight = `${listing.flightNo} ${cityName(listing.originCode)} به ${cityName(listing.destinationCode)}`;
  await audit(req, {
    actorId: actor.id,
    action: suspended ? "admin.listing_suspended" : "admin.listing_restored",
    targetType: "listing",
    targetId: listingId,
    details: { flight, ...(suspended ? { reason } : {}) },
  });
  // Whichever way the admin got here, travellers who reported the offer hear it was taken down.
  if (suspended) await resolveListingReports(listingId, "suspended");
  await tell(
    listing.accountId,
    suspended ? `پرواز ${flight} از نتایج پنهان شد` : `پرواز ${flight} دوباره نمایش داده می‌شود`,
    suspended ? `مدیر سایت این پرواز را معلق کرد.${reason ? ` دلیل: ${reason}` : ""}` : "تعلیق این پرواز برداشته شد.",
    "/dashboard/agency",
  );
}

// ---------------------------------------------------------------------------
// Agency verification
// ---------------------------------------------------------------------------

/** An agency asks for the verified badge; it needs a license number and a real description first. */
export async function requestVerification(accountId: string, req: Request) {
  const [profile] = (await AppDataSource.query(
    `SELECT verified_at AS "verifiedAt", license_no AS "licenseNo", description FROM agency_profiles WHERE account_id = $1`,
    [accountId],
  )) as { verifiedAt: Date | null; licenseNo: string | null; description: string }[];
  if (!profile) throw notFound();
  if (profile.verifiedAt) throw new HttpError(409, "ALREADY_VERIFIED");
  if (!profile.licenseNo || profile.description.trim().length < 30) throw new HttpError(400, "PROFILE_INCOMPLETE");
  await AppDataSource.query(
    `UPDATE agency_profiles SET verification_requested_at = COALESCE(verification_requested_at, now()) WHERE account_id = $1`,
    [accountId],
  );
  await audit(req, {
    actorId: accountId,
    action: "agency.verification_requested",
    targetType: "account",
    targetId: accountId,
  });
}

export async function setAgencyVerification(
  actor: Account,
  agencyId: string,
  { verified, note }: { verified: boolean; note: string | null },
  req: Request,
) {
  const [row] = (await AppDataSource.query(
    `WITH updated AS (
       UPDATE agency_profiles
          SET verified_at = CASE WHEN $2 THEN COALESCE(verified_at, now()) ELSE NULL END,
              verification_requested_at = NULL
        WHERE account_id = $1
       RETURNING 1
     )
     SELECT 1 FROM updated`,
    [agencyId, verified],
  )) as unknown[];
  if (!row) throw notFound();
  await invalidate(SEARCH_CACHE_PREFIX);
  await audit(req, {
    actorId: actor.id,
    action: verified ? "admin.agency_verified" : "admin.agency_unverified",
    targetType: "account",
    targetId: agencyId,
    details: note ? { note } : {},
  });
  await tell(
    agencyId,
    verified ? "آژانس شما تأیید شد" : "نشان تأیید آژانس داده نشد",
    verified
      ? "از این پس کنار نام آژانس در نتایج و صفحهٔ آژانس، نشان «تأییدشده» دیده می‌شود."
      : `مدارک آژانس کامل نبود یا تأیید نشد.${note ? ` توضیح مدیر: ${note}` : ""} پس از اصلاح پروفایل دوباره درخواست دهید.`,
    "/dashboard/profile",
  );
}

// ---------------------------------------------------------------------------
// Review reports
// ---------------------------------------------------------------------------

/** Anyone signed in (not a guest, not the author) can report a published review; reporting again updates the reason. */
export async function reportReview(user: Account, reviewId: string, reason: string) {
  if (isGuestAccount(user)) throw new HttpError(403, "GUEST_ACCOUNT");
  const [review] = (await AppDataSource.query(
    `SELECT author_id AS "authorId" FROM agency_reviews WHERE id = $1 AND status = 'published'`,
    [reviewId],
  )) as { authorId: string }[];
  if (!review) throw notFound();
  if (review.authorId === user.id) throw new HttpError(400, "CANNOT_REPORT_OWN_REVIEW");
  await AppDataSource.query(
    `INSERT INTO review_reports (review_id, reporter_id, reason) VALUES ($1, $2, $3)
     ON CONFLICT (review_id, reporter_id) DO UPDATE SET reason = EXCLUDED.reason, created_at = now(), resolved_at = NULL`,
    [reviewId, user.id, reason],
  );
}

async function resolveReports(reviewId: string) {
  await AppDataSource.query(
    `UPDATE review_reports SET resolved_at = now() WHERE review_id = $1 AND resolved_at IS NULL`,
    [reviewId],
  );
}

export async function setReviewStatus(actor: Account, reviewId: string, status: "published" | "hidden", req: Request) {
  const [row] = (await AppDataSource.query(
    `WITH updated AS (UPDATE agency_reviews SET status = $2 WHERE id = $1 RETURNING agency_id) SELECT agency_id FROM updated`,
    [reviewId, status],
  )) as { agency_id: string }[];
  if (!row) throw notFound();
  await resolveReports(reviewId);
  await invalidate(SEARCH_CACHE_PREFIX);
  await audit(req, {
    actorId: actor.id,
    action: status === "hidden" ? "admin.review_hidden" : "admin.review_restored",
    targetType: "review",
    targetId: reviewId,
  });
}

export async function dismissReports(actor: Account, reviewId: string, req: Request) {
  await resolveReports(reviewId);
  await audit(req, { actorId: actor.id, action: "admin.reports_dismissed", targetType: "review", targetId: reviewId });
}

// ---------------------------------------------------------------------------
// What administrators look at
// ---------------------------------------------------------------------------

export async function moderationQueue() {
  const [verificationRequests, reportedReviews, [counts], listings] = (await Promise.all([
    AppDataSource.query(
      `SELECT p.account_id AS "agencyId", p.slug, COALESCE(NULLIF(a.agency_name, ''), a.name) AS name, p.city,
              p.license_no AS "licenseNo", p.description, p.website, p.verification_requested_at AS "requestedAt",
              (SELECT count(*)::int FROM flight_listings f WHERE f.account_id = a.id) AS listings
         FROM agency_profiles p JOIN accounts a ON a.id = p.account_id
        WHERE p.verification_requested_at IS NOT NULL AND p.verified_at IS NULL
        ORDER BY p.verification_requested_at`,
    ),
    AppDataSource.query(
      `SELECT r.id AS "reviewId", r.rating, r.body, r.status, r.created_at AS "createdAt",
              u.name AS "authorName", p.slug AS "agencySlug",
              COALESCE(NULLIF(ag.agency_name, ''), ag.name) AS "agencyName",
              count(rr.*)::int AS reports, max(rr.created_at) AS "lastReportedAt",
              (array_agg(rr.reason ORDER BY rr.created_at DESC) FILTER (WHERE rr.reason <> ''))[1:5] AS reasons
         FROM review_reports rr
         JOIN agency_reviews r ON r.id = rr.review_id
         JOIN accounts u ON u.id = r.author_id
         JOIN accounts ag ON ag.id = r.agency_id
         LEFT JOIN agency_profiles p ON p.account_id = r.agency_id
        WHERE rr.resolved_at IS NULL
        GROUP BY r.id, u.name, p.slug, ag.agency_name, ag.name
        ORDER BY reports DESC, "lastReportedAt" DESC
        LIMIT 100`,
    ),
    AppDataSource.query(
      `SELECT (SELECT count(*)::int FROM accounts WHERE suspended_at IS NOT NULL) AS "suspendedAccounts",
              (SELECT count(*)::int FROM flight_listings WHERE suspended_at IS NOT NULL) AS "suspendedListings",
              (SELECT count(*)::int FROM agency_reviews WHERE status = 'hidden') AS "hiddenReviews"`,
    ),
    reportedListings(),
  ])) as [
    {
      agencyId: string;
      slug: string;
      name: string;
      city: string | null;
      licenseNo: string | null;
      description: string;
      website: string | null;
      requestedAt: Date;
      listings: number;
    }[],
    {
      reviewId: string;
      rating: number;
      body: string;
      status: string;
      createdAt: Date;
      authorName: string;
      agencySlug: string | null;
      agencyName: string;
      reports: number;
      lastReportedAt: Date;
      reasons: string[] | null;
    }[],
    { suspendedAccounts: number; suspendedListings: number; hiddenReviews: number }[],
    Awaited<ReturnType<typeof reportedListings>>,
  ];
  return {
    verificationRequests: verificationRequests.map((v) => ({ ...v, requestedAt: v.requestedAt.getTime() })),
    reportedReviews: reportedReviews.map(({ authorName, createdAt, lastReportedAt, reasons, ...r }) => ({
      ...r,
      author: reviewerName(authorName),
      createdAt: createdAt.getTime(),
      lastReportedAt: lastReportedAt.getTime(),
      reasons: reasons ?? [],
    })),
    reportedListings: listings,
    counts,
  };
}

/** Finds listings by flight number, route ("THR-MHD") or agency name. */
export async function findListingsForAdmin({ q, status }: { q: string; status: "all" | "suspended" }) {
  const params: unknown[] = [];
  const where: string[] = [];
  const term = q.trim();
  const route = /^([A-Za-z]{3})[\s\-→>]+([A-Za-z]{3})$/.exec(term);
  if (route) {
    where.push(
      `f.origin_code = $${params.push(route[1].toUpperCase())} AND f.destination_code = $${params.push(route[2].toUpperCase())}`,
    );
  } else if (term) {
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `(f.flight_no ILIKE $${params.push(like)} OR a.agency_name ILIKE $${params.length} OR a.name ILIKE $${params.length})`,
    );
  }
  if (status === "suspended") where.push("f.suspended_at IS NOT NULL");
  const rows = (await AppDataSource.query(
    `SELECT f.id, f.origin_code AS "originCode", f.destination_code AS "destinationCode", f.airline,
            f.flight_no AS "flightNo", f.depart_at AS "departAt", f.price_toman::bigint AS "priceToman",
            f.is_active AS "isActive", f.suspended_at AS "suspendedAt", f.suspension_reason AS "suspensionReason",
            COALESCE(NULLIF(a.agency_name, ''), a.name) AS "agencyName", a.suspended_at IS NOT NULL AS "agencySuspended"
       FROM flight_listings f JOIN accounts a ON a.id = f.account_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY f.suspended_at DESC NULLS LAST, f.depart_at DESC
      LIMIT 50`,
    params,
  )) as {
    id: string;
    departAt: Date;
    priceToman: string;
    suspendedAt: Date | null;
    [key: string]: unknown;
  }[];
  return rows.map((r) => ({
    ...r,
    departAt: r.departAt.getTime(),
    priceToman: Number(r.priceToman),
    suspendedAt: r.suspendedAt?.getTime() ?? null,
  }));
}

/** The audit log, newest first, with who did it. */
export async function auditEntries({
  action,
  before,
  limit,
}: {
  action?: AuditAction;
  before?: number;
  limit: number;
}) {
  const params: unknown[] = [limit];
  const where: string[] = [];
  if (action) where.push(`l.action = $${params.push(action)}`);
  if (before !== undefined) where.push(`l.created_at < $${params.push(new Date(before))}`);
  const rows = (await AppDataSource.query(
    `SELECT l.id, l.action, l.target_type AS "targetType", l.target_id AS "targetId", l.details,
            l.created_at AS "createdAt", a.name AS "actorName", COALESCE(a.email, a.phone) AS "actorContact"
       FROM audit_log l LEFT JOIN accounts a ON a.id = l.actor_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $1`,
    params,
  )) as { createdAt: Date; [key: string]: unknown }[];
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() }));
}
