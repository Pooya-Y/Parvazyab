import { In, MoreThan } from "typeorm";
import { AppDataSource, accounts, flightListings, popularRoutes } from "./dataSource";
import { hashPassword } from "../auth/auth";
import { resolveCanonicalAirlineName } from "../domain/airlineRegistry";
import { findAirport } from "../domain/airports";
import { DEMO_WINDOW_DAYS, buildDemoHistory, buildDemoSchedule, demoRoutes } from "./demoSchedule";
import { tehranTodayKey } from "../domain/time";
import { randomUUID } from "node:crypto";
import { ensureAgencyProfile } from "../services/agencies";

const DEMO_PASSWORD = "Demo1234!";

const DEMO_AGENCIES = [
  { email: "skybazaar@example.com", name: "SkyBazaar", agencyName: "آسمان بازار" },
  { email: "parvazino@example.com", name: "Parvazino", agencyName: "پروازینو" },
  { email: "hamsafar@example.com", name: "Hamsafar", agencyName: "همسفر" },
];

const POPULAR_ROUTES = ["THR-MHD", "THR-KIH", "THR-SYZ", "IKA-DXB", "IKA-IST", "IFN-SYZ", "TBZ-THR", "THR-BND"];

async function ensureAccount(
  email: string,
  fields: { name: string; role: "user" | "agency" | "admin"; agencyName?: string },
  password: string,
) {
  const repo = accounts();
  // Seeded addresses are configuration, not sign-ups: nobody could click a verification link for them.
  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    if (!existing.emailVerifiedAt) await repo.update(existing.id, { emailVerifiedAt: new Date() });
    return existing;
  }
  return repo.save(
    repo.create({ email, ...fields, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() }),
  );
}

/**
 * Demo agencies, a demo user, popular routes, and a rolling two-week timetable.
 * Idempotent: only flights missing from the window are inserted, so running it on
 * every start (and daily from the worker) keeps the demo populated.
 */
export async function seedDemoData(now = Date.now()) {
  const agencyIds: string[] = [];
  for (const a of DEMO_AGENCIES) {
    const account = await ensureAccount(
      a.email,
      { name: a.name, agencyName: a.agencyName, role: "agency" },
      DEMO_PASSWORD,
    );
    agencyIds.push(account.id);
  }
  await ensureAccount("user@example.com", { name: "کاربر نمونه", role: "user" }, DEMO_PASSWORD);

  const routes = popularRoutes();
  if ((await routes.count()) === 0) {
    await routes.save(
      POPULAR_ROUTES.map((key, routeOrder) => {
        const [originCode, destinationCode] = key.split("-");
        return routes.create({ originCode, destinationCode, routeOrder });
      }),
    );
  }

  const inserted = await ensureDemoSchedule(agencyIds, now);
  if (inserted) console.log(`Seeded ${inserted} demo flights`);
  const history = await backfillDemoHistory(now);
  if (history) console.log(`Seeded ${history} demo price-history days`);
  const clicks = await backfillDemoClicks(agencyIds);
  if (clicks) console.log(`Seeded ${clicks} demo outbound clicks`);
  const reviews = await ensureDemoProfiles(agencyIds);
  if (reviews) console.log(`Seeded ${reviews} demo agency reviews`);
}

const DEMO_PROFILES = [
  {
    slug: "skybazaar",
    city: "تهران",
    website: "https://skybazaar.example",
    supportPhone: "021-91001234",
    licenseNo: "بند ب-۱۲۳۴",
    verified: true,
    description:
      "فروش بلیط پروازهای داخلی و خارجی از سال ۱۳۹۲. پشتیبانی تلفنی شبانه‌روزی و استرداد آنلاین برای پروازهای سیستمی.",
    ratings: [5, 5, 4, 5, 4, 5, 5, 4],
  },
  {
    slug: "parvazino",
    city: "مشهد",
    website: "https://parvazino.example",
    supportPhone: "051-38001234",
    licenseNo: "بند ب-۵۶۷۸",
    verified: true,
    description: "تخصص ما پروازهای چارتری مشهد و کیش است؛ قیمت‌ها هر روز به‌روز می‌شوند.",
    ratings: [4, 5, 3, 4, 4, 5],
  },
  {
    slug: "hamsafar",
    city: "شیراز",
    website: null,
    supportPhone: "071-32001234",
    licenseNo: null,
    verified: false,
    description: "آژانس مسافرتی همسفر، فروش بلیط هواپیما و تور.",
    ratings: [4, 3, 2, 4, 3],
  },
];

const DEMO_REVIEW_TEXTS: Record<number, string[]> = {
  5: ["خرید سریع بود و بلیط همان لحظه صادر شد.", "پشتیبانی عالی؛ تغییر تاریخ را بدون دردسر انجام دادند.", ""],
  4: ["قیمت خوبی داشت، فقط صدور بلیط کمی طول کشید.", "راضی بودم، دفعهٔ بعد هم از همین‌جا می‌خرم.", ""],
  3: ["بد نبود ولی جواب تلفن دیر داده شد.", ""],
  2: ["قیمت نهایی از قیمت اعلام‌شده بیشتر بود.", "استرداد بیش از یک هفته طول کشید."],
};

const DEMO_REVIEWER_NAMES = [
  "سارا کاظمی",
  "علی رضایی",
  "مریم احمدی",
  "رضا موسوی",
  "نگار حسینی",
  "حمید کریمی",
  "لیلا جعفری",
  "امیر صادقی",
];

/**
 * Profiles for the demo agencies (only while they still have their placeholder
 * address) and a few reviews from demo travellers (only for agencies without
 * any). Returns the number of reviews added.
 */
async function ensureDemoProfiles(agencyIds: string[]): Promise<number> {
  const reviewerIds: string[] = [];
  for (const [i, name] of DEMO_REVIEWER_NAMES.entries()) {
    // Throwaway passwords: these accounts only exist to author demo reviews.
    const reviewer = await ensureAccount(`reviewer${i + 1}@example.com`, { name, role: "user" }, randomUUID());
    reviewerIds.push(reviewer.id);
  }
  let added = 0;
  for (const [i, agencyId] of agencyIds.entries()) {
    const p = DEMO_PROFILES[i];
    if (!p) continue;
    await ensureAgencyProfile(agencyId);
    await AppDataSource.query(
      `UPDATE agency_profiles
          SET slug = $2, description = $3, website = $4, support_phone = $5, city = $6, license_no = $7,
              verified_at = CASE WHEN $8 THEN now() ELSE NULL END
        WHERE account_id = $1 AND slug LIKE 'agency-%'`,
      [agencyId, p.slug, p.description, p.website, p.supportPhone, p.city, p.licenseNo, p.verified],
    );
    const [{ any }] = (await AppDataSource.query(
      `SELECT EXISTS (SELECT 1 FROM agency_reviews WHERE agency_id = $1) AS any`,
      [agencyId],
    )) as { any: boolean }[];
    if (any) continue;
    for (const [j, rating] of p.ratings.entries()) {
      const texts = DEMO_REVIEW_TEXTS[rating] ?? [""];
      await AppDataSource.query(
        `INSERT INTO agency_reviews (agency_id, author_id, rating, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now() - make_interval(days => $5), now() - make_interval(days => $5))
         ON CONFLICT DO NOTHING`,
        [agencyId, reviewerIds[j % reviewerIds.length], rating, texts[j % texts.length], 3 + j * 6],
      );
      added++;
    }
  }
  return added;
}

/**
 * A few weeks of "buy" clicks on the demo agencies' upcoming flights, so their
 * analytics page has something to show. Only for an agency with no clicks yet;
 * cheaper fares get clicked more, as they would.
 */
async function backfillDemoClicks(agencyIds: string[]): Promise<number> {
  let inserted = 0;
  for (const agencyId of agencyIds) {
    const [{ any }] = (await AppDataSource.query(
      `SELECT EXISTS (SELECT 1 FROM listing_clicks WHERE agency_id = $1) AS any`,
      [agencyId],
    )) as { any: boolean }[];
    if (any) continue;
    const rows = (await AppDataSource.query(
      `WITH ranked AS (
         SELECT l.*, percent_rank() OVER (PARTITION BY origin_code, destination_code ORDER BY price_toman) AS pr
           FROM flight_listings l
          WHERE l.account_id = $1 AND l.is_active AND l.depart_at > now()
       )
       INSERT INTO listing_clicks (listing_id, agency_id, origin_code, destination_code, airline, flight_no,
                                   depart_at, price_toman, source, visitor_hash, created_at)
       SELECT r.id, r.account_id, r.origin_code, r.destination_code, r.airline, r.flight_no, r.depart_at,
              r.price_toman,
              (ARRAY['search', 'search', 'search', 'detail', 'roundtrip'])[1 + floor(random() * 5)::int],
              -- A pool of returning visitors, so unique visitors come out below clicks.
              v.id || v.id,
              -- Somewhere in the three weeks before departure, never in the future.
              r.depart_at - interval '21 days' + random() * (LEAST(now(), r.depart_at) - (r.depart_at - interval '21 days'))
         FROM ranked r
        CROSS JOIN LATERAL generate_series(1, 1 + floor((1 - r.pr) * 6 * random())::int) AS g
        CROSS JOIN LATERAL (SELECT md5('demo-visitor-' || floor(random() * 250)::int || g) AS id) AS v
        WHERE r.depart_at - interval '21 days' < now()
       RETURNING 1`,
      [agencyId],
    )) as unknown[];
    inserted += rows.length;
  }
  return inserted;
}

const DEMO_HISTORY_DAYS = 60;

/** Past daily lows for demo routes, so trend charts have something to show. Never overwrites real snapshots. */
async function backfillDemoHistory(now: number): Promise<number> {
  const today = tehranTodayKey(now);
  let inserted = 0;
  for (const route of demoRoutes()) {
    const snapshots = buildDemoHistory(route, DEMO_HISTORY_DAYS, today);
    const rows = (await AppDataSource.query(
      `INSERT INTO route_price_snapshots (origin_code, destination_code, snapshot_date, min_price, avg_price, offer_count)
       SELECT $1, $2, d::date, p, a, 1
         FROM unnest($3::text[], $4::bigint[], $5::bigint[]) AS s(d, p, a)
       ON CONFLICT DO NOTHING
       RETURNING 1`,
      [
        route.origin,
        route.destination,
        snapshots.map((s) => s.date),
        snapshots.map((s) => s.minPrice),
        snapshots.map((s) => s.avgPrice),
      ],
    )) as unknown[];
    inserted += rows.length;
  }
  return inserted;
}

/** Insert the templated flights of the next DEMO_WINDOW_DAYS that don't exist yet. */
async function ensureDemoSchedule(agencyIds: string[], now: number): Promise<number> {
  const repo = flightListings();
  const keyOf = (accountId: string, flightNo: string, departAt: Date, cabin: string) =>
    `${accountId}|${flightNo}|${departAt.getTime()}|${cabin}`;
  const existing = await repo.find({
    where: { accountId: In(agencyIds), departAt: MoreThan(new Date(now)) },
    select: { accountId: true, flightNo: true, departAt: true, cabin: true },
  });
  const present = new Set(existing.map((l) => keyOf(l.accountId, l.flightNo, l.departAt, l.cabin)));

  const rows = buildDemoSchedule(DEMO_WINDOW_DAYS, now).flatMap((spec) => {
    const accountId = agencyIds[spec.sellerIndex];
    const origin = findAirport(spec.origin);
    const destination = findAirport(spec.destination);
    if (!accountId || !origin || !destination) return [];
    if (present.has(keyOf(accountId, spec.flightNo, spec.departAt, spec.cabin))) return [];
    return [
      repo.create({
        accountId,
        originCode: origin.code,
        originCity: origin.city,
        destinationCode: destination.code,
        destinationCity: destination.city,
        airline: resolveCanonicalAirlineName(spec.airline),
        flightNo: spec.flightNo,
        departAt: spec.departAt,
        arriveAt: new Date(spec.departAt.getTime() + spec.durationMin * 60_000),
        durationMin: spec.durationMin,
        stops: spec.stops,
        cabin: spec.cabin,
        fareType: spec.fareType,
        priceToman: spec.priceToman,
        bookingUrl: `https://example.com/booking/${encodeURIComponent(spec.flightNo)}`,
        isActive: true,
      }),
    ];
  });
  if (rows.length) await repo.save(rows, { chunk: 200 });
  return rows.length;
}

export async function bootstrapAdmin(email: string, password: string) {
  const admin = await ensureAccount(email.toLowerCase(), { name: "مدیر سیستم", role: "admin" }, password);
  if (admin.role !== "admin")
    console.warn(`ADMIN_EMAIL ${email} belongs to an existing non-admin account; not promoted.`);
}

if (require.main === module) {
  AppDataSource.initialize()
    .then(() => AppDataSource.runMigrations())
    .then(() => seedDemoData())
    .then(() => AppDataSource.destroy())
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
