import { In, MoreThan } from "typeorm";
import { AppDataSource, accounts, flightListings, popularRoutes } from "./dataSource";
import { hashPassword } from "../auth/auth";
import { resolveCanonicalAirlineName } from "../domain/airlineRegistry";
import { findAirport } from "../domain/airports";
import { DEMO_WINDOW_DAYS, buildDemoHistory, buildDemoSchedule, demoRoutes } from "./demoSchedule";
import { tehranTodayKey } from "../domain/time";

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
