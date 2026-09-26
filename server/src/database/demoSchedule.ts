/**
 * Deterministic demo timetable: a rolling window of flights generated from weekly
 * templates, so demo data never runs out and prices vary believably by weekday.
 * Pure (no I/O) — `seed.ts` inserts whatever is missing.
 */
import { TEHRAN_OFFSET_MS, tehranWallClock } from "../domain/time";
import type { Cabin, FareType } from "./entities";

export const DEMO_WINDOW_DAYS = 14;

export interface DemoTemplate {
  flightNo: string;
  airline: string;
  origin: string;
  destination: string;
  time: string; // HH:mm, Tehran
  durationMin: number;
  stops: number;
  basePrice: number;
  /** Indices into the demo agency list; each seller lists the flight at its own price. */
  sellers: number[];
  cabin?: Cabin;
  /** Sellers offering charter seats (typically a little cheaper, stricter refund rules). */
  charterSellers?: number[];
  /** Persian weekdays the flight operates (0 = Saturday … 6 = Friday); every day if omitted. */
  weekdays?: number[];
}

// prettier-ignore
export const DEMO_TEMPLATES: DemoTemplate[] = [
  // Domestic
  { flightNo: "W5-101", airline: "ماهان ایر", origin: "THR", destination: "MHD", time: "06:30", durationMin: 90, stops: 0, basePrice: 2_450_000, sellers: [0, 1] , charterSellers: [1] },
  { flightNo: "W5-102", airline: "ماهان ایر", origin: "MHD", destination: "THR", time: "09:15", durationMin: 95, stops: 0, basePrice: 2_400_000, sellers: [0, 1] },
  { flightNo: "IR-112", airline: "ایران ایر", origin: "THR", destination: "MHD", time: "09:00", durationMin: 95, stops: 0, basePrice: 2_900_000, sellers: [0] },
  { flightNo: "IR-113", airline: "ایران ایر", origin: "MHD", destination: "THR", time: "12:10", durationMin: 95, stops: 0, basePrice: 2_850_000, sellers: [0] },
  { flightNo: "IZ-404", airline: "زاگرس", origin: "THR", destination: "MHD", time: "14:15", durationMin: 480, stops: 1, basePrice: 1_980_000, sellers: [1], weekdays: [0, 2, 4] , charterSellers: [1] },
  { flightNo: "QB-221", airline: "قشم ایر", origin: "THR", destination: "MHD", time: "19:45", durationMin: 92, stops: 0, basePrice: 2_600_000, sellers: [2, 0] , charterSellers: [2] },
  { flightNo: "QB-222", airline: "قشم ایر", origin: "MHD", destination: "THR", time: "22:30", durationMin: 92, stops: 0, basePrice: 2_550_000, sellers: [2] },
  { flightNo: "IR-551", airline: "ایران ایر", origin: "THR", destination: "KIH", time: "07:15", durationMin: 125, stops: 0, basePrice: 3_150_000, sellers: [0, 2] },
  { flightNo: "W5-553", airline: "ماهان ایر", origin: "THR", destination: "KIH", time: "12:30", durationMin: 130, stops: 0, basePrice: 2_780_000, sellers: [1] , charterSellers: [1] },
  { flightNo: "W5-554", airline: "ماهان ایر", origin: "KIH", destination: "THR", time: "16:00", durationMin: 130, stops: 0, basePrice: 2_700_000, sellers: [1, 2] },
  { flightNo: "IR-260", airline: "ایران ایر", origin: "THR", destination: "SYZ", time: "08:40", durationMin: 85, stops: 0, basePrice: 2_300_000, sellers: [0, 1] },
  { flightNo: "W5-261", airline: "ماهان ایر", origin: "SYZ", destination: "THR", time: "18:20", durationMin: 85, stops: 0, basePrice: 2_250_000, sellers: [2] , charterSellers: [2] },
  { flightNo: "IZ-708", airline: "زاگرس", origin: "IFN", destination: "SYZ", time: "10:45", durationMin: 60, stops: 0, basePrice: 1_650_000, sellers: [1], weekdays: [1, 3, 5] },
  { flightNo: "QB-731", airline: "قشم ایر", origin: "IFN", destination: "SYZ", time: "17:20", durationMin: 65, stops: 0, basePrice: 1_570_000, sellers: [2] },
  { flightNo: "IR-321", airline: "ایران ایر", origin: "TBZ", destination: "THR", time: "07:50", durationMin: 70, stops: 0, basePrice: 1_900_000, sellers: [0] },
  { flightNo: "IR-322", airline: "ایران ایر", origin: "THR", destination: "TBZ", time: "20:10", durationMin: 70, stops: 0, basePrice: 1_950_000, sellers: [0, 2] },
  { flightNo: "W5-481", airline: "ماهان ایر", origin: "THR", destination: "BND", time: "05:40", durationMin: 115, stops: 0, basePrice: 3_100_000, sellers: [1], weekdays: [0, 1, 3, 5] },
  { flightNo: "IZ-610", airline: "زاگرس", origin: "THR", destination: "AWZ", time: "11:20", durationMin: 80, stops: 0, basePrice: 2_050_000, sellers: [2] },
  { flightNo: "QB-915", airline: "قشم ایر", origin: "THR", destination: "GSM", time: "13:00", durationMin: 120, stops: 0, basePrice: 2_900_000, sellers: [0], weekdays: [2, 5] },
  { flightNo: "IR-704", airline: "ایران ایر", origin: "THR", destination: "IFN", time: "16:30", durationMin: 60, stops: 0, basePrice: 1_750_000, sellers: [1, 2] },
  { flightNo: "W5-190", airline: "ماهان ایر", origin: "THR", destination: "KER", time: "21:00", durationMin: 100, stops: 0, basePrice: 2_200_000, sellers: [0] },
  // International (Imam Khomeini)
  { flightNo: "TK-878", airline: "ترکیش ایرلاینز", origin: "IKA", destination: "DXB", time: "04:30", durationMin: 170, stops: 0, basePrice: 9_800_000, sellers: [0] },
  { flightNo: "FZ-737", airline: "فلای دبی", origin: "IKA", destination: "DXB", time: "10:15", durationMin: 165, stops: 0, basePrice: 8_450_000, sellers: [1, 2] , charterSellers: [2] },
  { flightNo: "FZ-738", airline: "فلای دبی", origin: "DXB", destination: "IKA", time: "14:40", durationMin: 150, stops: 0, basePrice: 8_200_000, sellers: [1, 2] },
  { flightNo: "EK-972", airline: "امارات", origin: "IKA", destination: "DXB", time: "16:40", durationMin: 150, stops: 0, basePrice: 10_900_000, sellers: [2] },
  { flightNo: "EK-972", airline: "امارات", origin: "IKA", destination: "DXB", time: "16:40", durationMin: 150, stops: 0, basePrice: 24_000_000, sellers: [2], cabin: "business" },
  { flightNo: "TK-880", airline: "ترکیش ایرلاینز", origin: "IKA", destination: "IST", time: "09:00", durationMin: 210, stops: 0, basePrice: 14_500_000, sellers: [0, 1] },
  { flightNo: "TK-880", airline: "ترکیش ایرلاینز", origin: "IKA", destination: "IST", time: "09:00", durationMin: 210, stops: 0, basePrice: 32_000_000, sellers: [0], cabin: "business" },
  { flightNo: "TK-881", airline: "ترکیش ایرلاینز", origin: "IST", destination: "IKA", time: "16:45", durationMin: 205, stops: 0, basePrice: 14_200_000, sellers: [0, 1] },
  { flightNo: "QB-501", airline: "قشم ایر", origin: "IKA", destination: "DOH", time: "07:20", durationMin: 125, stops: 0, basePrice: 11_200_000, sellers: [0], weekdays: [1, 4] },
  { flightNo: "IR-651", airline: "ایران ایر", origin: "IKA", destination: "NJF", time: "06:00", durationMin: 120, stops: 0, basePrice: 6_900_000, sellers: [0, 1], weekdays: [0, 2, 4, 6] , charterSellers: [1] },
  { flightNo: "W5-081", airline: "ماهان ایر", origin: "IKA", destination: "BGW", time: "11:00", durationMin: 105, stops: 0, basePrice: 6_100_000, sellers: [2], weekdays: [1, 3, 5] },
];

/** Demand by Persian weekday (Saturday … Friday): the Thursday/Friday weekend costs more. */
const WEEKDAY_FACTOR = [1.0, 0.95, 0.93, 1.0, 1.08, 1.15, 1.05];

/** FNV-1a → [0, 1): stable pseudo-randomness so reseeding reproduces the same prices. */
export function unitHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

export interface DemoListingSpec {
  sellerIndex: number;
  flightNo: string;
  airline: string;
  origin: string;
  destination: string;
  departAt: Date;
  durationMin: number;
  stops: number;
  cabin: Cabin;
  fareType: FareType;
  priceToman: number;
}

export function demoPrice(
  t: DemoTemplate,
  dateKey: string,
  persianWeekday: number,
  seller: number,
  fareType: FareType = "scheduled",
): number {
  const noise = unitHash(`${t.flightNo}|${t.cabin ?? "economy"}|${dateKey}|${seller}`) * 0.16 - 0.08; // ±8%
  const sellerMarkup = 1 + seller * 0.035;
  const charterDiscount = fareType === "charter" ? 0.94 : 1;
  const raw = t.basePrice * WEEKDAY_FACTOR[persianWeekday] * sellerMarkup * charterDiscount * (1 + noise);
  return Math.round(raw / 10_000) * 10_000;
}

/** Every templated flight departing after `now` within the next `days` Tehran days. */
export function buildDemoSchedule(days = DEMO_WINDOW_DAYS, now = Date.now()): DemoListingSpec[] {
  const specs: DemoListingSpec[] = [];
  for (let day = 0; day < days; day++) {
    const noon = tehranWallClock(day, 12, 0, now);
    const persianWeekday = (noon.getUTCDay() + 1) % 7;
    const dateKey = new Date(noon.getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
    for (const t of DEMO_TEMPLATES) {
      if (t.weekdays && !t.weekdays.includes(persianWeekday)) continue;
      const [hour, minute] = t.time.split(":").map(Number);
      const departAt = tehranWallClock(day, hour, minute, now);
      if (departAt.getTime() <= now) continue;
      for (const seller of t.sellers) {
        const fareType: FareType = t.charterSellers?.includes(seller) ? "charter" : "scheduled";
        specs.push({
          sellerIndex: seller,
          flightNo: t.flightNo,
          airline: t.airline,
          origin: t.origin,
          destination: t.destination,
          departAt,
          durationMin: t.durationMin,
          stops: t.stops,
          cabin: t.cabin ?? "economy",
          fareType,
          priceToman: demoPrice(t, dateKey, persianWeekday, t.sellers.indexOf(seller), fareType),
        });
      }
    }
  }
  return specs;
}

/** Demo routes (economy), each with its lowest template fare. */
export function demoRoutes(): { origin: string; destination: string; basePrice: number }[] {
  const byRoute = new Map<string, { origin: string; destination: string; basePrice: number }>();
  for (const t of DEMO_TEMPLATES) {
    if ((t.cabin ?? "economy") !== "economy") continue;
    const key = `${t.origin}-${t.destination}`;
    const existing = byRoute.get(key);
    if (!existing || t.basePrice < existing.basePrice) {
      byRoute.set(key, { origin: t.origin, destination: t.destination, basePrice: t.basePrice });
    }
  }
  return [...byRoute.values()];
}

export interface DemoSnapshot {
  origin: string;
  destination: string;
  date: string;
  minPrice: number;
  avgPrice: number;
}

/**
 * Plausible past daily lows for a demo route: a weekly rhythm, a slower swell,
 * a per-route drift up or down over the period, and a little noise. Deterministic.
 */
export function buildDemoHistory(
  route: { origin: string; destination: string; basePrice: number },
  days: number,
  today: string,
): DemoSnapshot[] {
  const key = `${route.origin}-${route.destination}`;
  const drift = (unitHash(`${key}|drift`) - 0.5) * 0.24; // −12% … +12% across the window
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: days }, (_, i) => {
    const daysAgo = days - i; // oldest first, ending yesterday
    const date = new Date(Date.UTC(y, m - 1, d - daysAgo)).toISOString().slice(0, 10);
    const t = i / days;
    const wave = 0.05 * Math.sin((2 * Math.PI * daysAgo) / 7) + 0.04 * Math.sin((2 * Math.PI * daysAgo) / 23);
    const noise = unitHash(`${key}|${date}`) * 0.08 - 0.04;
    const level = route.basePrice * 0.92 * (1 + drift * (1 - t) + wave + noise);
    const minPrice = Math.round(level / 10_000) * 10_000;
    return {
      origin: route.origin,
      destination: route.destination,
      date,
      minPrice,
      avgPrice: Math.round((minPrice * 1.12) / 10_000) * 10_000,
    };
  });
}
