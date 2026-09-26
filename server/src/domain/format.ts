import { ALL_AIRPORTS, airportCity } from "./airports";
import { gregorianToJalaliKey } from "./jalali";
import { TEHRAN_OFFSET_MS } from "./time";

/**
 * Persian text for what the server writes itself (notifications, email, the
 * server-rendered route pages). Output matches the web client's formatters.
 */
const faNumber = new Intl.NumberFormat("fa-IR");
const faDayMonth = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/** The Iranian week, Saturday first (see `iranWeekday`). */
export const FA_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const FA_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/** "08:35" → "۰۸:۳۵" */
export const faDigits = (value: string | number) => String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

/** 1234567 → "۱٬۲۳۴٬۵۶۷" */
export const formatNumberFa = (value: number) => faNumber.format(value);

/** 2150000 → "۲٬۱۵۰٬۰۰۰ تومان" */
export const formatTomanFa = (toman: number) => `${faNumber.format(toman)} تومان`;

/** An instant as its Iran calendar day: "شنبه ۴ مهر". */
export const formatTehranDay = (at: Date) => faDayMonth.format(new Date(at.getTime() + TEHRAN_OFFSET_MS));

/** "تهران (مهرآباد)" → "تهران": message text names cities, not airports. */
export const cityName = (code: string) => airportCity(code).replace(/\s*\(.*\)$/, "");

const citiesWithSeveralAirports = new Set(
  ALL_AIRPORTS.map((a) => cityName(a.code)).filter((city, i, all) => all.indexOf(city) !== i),
);

/**
 * The shortest name that still identifies the airport: "مشهد", but
 * "تهران (مهرآباد)" because Tehran has two.
 */
export const placeName = (code: string) =>
  citiesWithSeveralAirports.has(cityName(code)) ? airportCity(code) : cityName(code);

/** 95 → "۱ ساعت و ۳۵ دقیقه" */
export function formatDurationFa(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${faDigits(m)} دقیقه`;
  if (m === 0) return `${faDigits(h)} ساعت`;
  return `${faDigits(h)} ساعت و ${faDigits(m)} دقیقه`;
}

/** Minutes after midnight → "۰۶:۰۵". */
export const formatClockFa = (minuteOfDay: number) =>
  faDigits(`${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`);

/** An instant's Tehran wall-clock time: "۰۸:۳۵". */
export function formatTehranTimeFa(epochMs: number): string {
  const d = new Date(epochMs + TEHRAN_OFFSET_MS);
  return formatClockFa(d.getUTCHours() * 60 + d.getUTCMinutes());
}

/** The Jalali parts of a `yyyy-mm-dd` key: "2026-09-27" → { year: 1405, month: 7, day: 5 }. */
export function jalaliDate(dateKey: string) {
  const [year, month, day] = gregorianToJalaliKey(dateKey).split("-").map(Number);
  return { year, month, day };
}

export const jalaliMonthName = (month: number) => FA_MONTHS[month - 1];

/** Day of the week of a date key, 0 = Saturday (the first day of the Iranian week). */
export function iranWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1) % 7;
}

/** "2026-09-27" → "۵ مهر ۱۴۰۵", or with `weekday` → "یکشنبه ۵ مهر". */
export function formatDateKeyFa(dateKey: string, { weekday = false }: { weekday?: boolean } = {}): string {
  const j = jalaliDate(dateKey);
  const dayMonth = `${faDigits(j.day)} ${jalaliMonthName(j.month)}`;
  if (!weekday) return `${dayMonth} ${faDigits(j.year)}`;
  return `${FA_WEEKDAYS[iranWeekday(dateKey)]} ${dayMonth}`;
}
