import { In, MoreThan } from "typeorm";
import { AppDataSource, accounts, flightListings, popularRoutes } from "./dataSource";
import { hashPassword } from "../auth/auth";
import { resolveCanonicalAirlineName } from "../domain/airlineRegistry";
import { findAirport } from "../domain/airports";
import { DEMO_WINDOW_DAYS, buildDemoSchedule } from "./demoSchedule";

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
  const existing = await repo.findOne({ where: { email } });
  if (existing) return existing;
  return repo.save(repo.create({ email, ...fields, passwordHash: await hashPassword(password) }));
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
