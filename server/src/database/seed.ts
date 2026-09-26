import { In, MoreThan } from "typeorm";
import { AppDataSource, accounts, flightListings, popularRoutes } from "./dataSource";
import { hashPassword } from "../auth/auth";
import { resolveCanonicalAirlineName } from "../domain/airlineRegistry";
import { findAirport } from "../domain/airports";
import { tehranWallClock } from "../domain/time";

const DEMO_PASSWORD = "Demo1234!";

const DEMO_AGENCIES = [
  { email: "skybazaar@example.com", name: "SkyBazaar", agencyName: "آسمان بازار" },
  { email: "parvazino@example.com", name: "Parvazino", agencyName: "پروازینو" },
];

const POPULAR_ROUTES = ["THR-MHD", "THR-KIH", "IFN-SYZ", "IKA-DXB", "THR-SYZ", "TBZ-THR"];

interface DemoFlight {
  flightNo: string;
  airline: string;
  origin: string;
  destination: string;
  dayOffset: number;
  hour: number;
  minute: number;
  durationMin: number;
  stops: number;
  priceToman: number;
}

// prettier-ignore
const DEMO_FLIGHTS: DemoFlight[] = ([
  ["W5-101", "ماهان ایر", "THR", "MHD", 1, 6, 30, 90, 0, 2450000],
  ["W5-101", "ماهان", "THR", "MHD", 1, 6, 30, 90, 0, 2690000],
  ["IR-112", "ایران ایر", "THR", "MHD", 1, 9, 0, 95, 0, 2980000],
  ["IZ-404", "زاگرس", "THR", "MHD", 1, 14, 15, 480, 1, 1980000],
  ["QB-221", "قشم ایر", "THR", "MHD", 2, 19, 45, 92, 0, 5900000],
  ["IR-551", "ایران ایر", "THR", "KIH", 2, 7, 15, 125, 0, 3150000],
  ["W5-553", "ماهان ایر", "THR", "KIH", 2, 12, 30, 130, 0, 2780000],
  ["IZ-708", "زاگرس", "IFN", "SYZ", 1, 10, 45, 95, 0, 2050000],
  ["QB-731", "قشم ایر", "IFN", "SYZ", 1, 17, 20, 98, 0, 1870000],
  ["TK-878", "ترکیش ایرلاینز", "IKA", "DXB", 1, 4, 30, 170, 0, 9800000],
  ["FZ-737", "فلای دبی", "IKA", "DXB", 1, 10, 15, 165, 0, 8450000],
  ["TK-880", "ترکیش ایرلاینز", "IKA", "IST", 2, 9, 0, 210, 0, 14500000],
  ["TK-880", "ترکیش ایرلاینز", "IKA", "IST", 2, 9, 0, 210, 0, 15200000],
  ["EK-970", "امارات", "IKA", "AUH", 3, 16, 40, 145, 0, 11300000],
  ["QB-501", "قشم ایر", "IKA", "DOH", 2, 7, 20, 160, 0, 12100000],
] as const).map(([flightNo, airline, origin, destination, dayOffset, hour, minute, durationMin, stops, priceToman]) => ({
  flightNo, airline, origin, destination, dayOffset, hour, minute, durationMin, stops, priceToman,
}));

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
 * Demo agencies, a demo user, popular routes, and a batch of upcoming flights.
 * Idempotent; flights are re-added (relative to today, Tehran time) whenever the
 * demo agencies have no upcoming flights left, so a long-running demo never goes empty.
 */
export async function seedDemoData() {
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

  const listings = flightListings();
  const upcoming = await listings.count({ where: { accountId: In(agencyIds), departAt: MoreThan(new Date()) } });
  if (upcoming > 0) return;

  const rows = DEMO_FLIGHTS.flatMap((f, i) => {
    const origin = findAirport(f.origin);
    const destination = findAirport(f.destination);
    if (!origin || !destination) return [];
    const departAt = tehranWallClock(f.dayOffset, f.hour, f.minute);
    return [
      listings.create({
        accountId: agencyIds[i % agencyIds.length],
        originCode: origin.code,
        originCity: origin.city,
        destinationCode: destination.code,
        destinationCity: destination.city,
        airline: resolveCanonicalAirlineName(f.airline),
        flightNo: f.flightNo,
        departAt,
        arriveAt: new Date(departAt.getTime() + f.durationMin * 60_000),
        durationMin: f.durationMin,
        stops: f.stops,
        cabin: "economy",
        priceToman: f.priceToman,
        bookingUrl: "https://example.com/booking",
        isActive: true,
      }),
    ];
  });
  await listings.save(rows);
  console.log(`Seeded ${rows.length} demo flights`);
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
