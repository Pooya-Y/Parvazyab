/**
 * Persian text/number formatting and Jalali (Shamsi) dates.
 *
 * Flight times are always shown in Iran time (fixed UTC+03:30 since 2022), not
 * the browser's zone, so a traveller abroad sees the same times as the airport
 * and the server's date filter. Calendar dates travel as Gregorian `yyyy-mm-dd`
 * keys and are converted arithmetically — no `Date` timezone drift.
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export const TEHRAN_OFFSET_MS = 210 * 60_000;

export function toFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII. */
export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Normalize text for search: Arabic ي/ك → Persian ی/ک, digits → ASCII, no ZWNJ, lowercase. */
export function normalizeForSearch(input: string): string {
  return toEnDigits(input)
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‏‎]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 1234567 → "۱٬۲۳۴٬۵۶۷" */
export function formatToman(value: number): string {
  return toFaDigits(Math.round(value).toLocaleString("en-US")).replace(/,/g, "٬");
}

/** 1234567 → "۱٬۲۳۴٬۵۶۷ تومان" */
export function formatPrice(value: number): string {
  return `${formatToman(value)} تومان`;
}

/** Price in thousands of toman for dense grids: 2_450_000 → "۲٬۴۵۰" (label the unit nearby). */
export function formatThousandToman(value: number): string {
  return formatToman(value / 1000);
}

/** Compact price: ۴٫۲ میلیون تومان / ۹۸۰ هزار تومان */
export function formatTomanCompact(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    const text = Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1);
    return `${toFaDigits(text).replace(".", "٫")} میلیون تومان`;
  }
  if (value >= 1000) return `${toFaDigits(Math.round(value / 1000))} هزار تومان`;
  return formatPrice(value);
}

/** 95 → "۱ ساعت و ۳۵ دقیقه" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${toFaDigits(m)} دقیقه`;
  if (m === 0) return `${toFaDigits(h)} ساعت`;
  return `${toFaDigits(h)} ساعت و ${toFaDigits(m)} دقیقه`;
}

export function formatStops(stops: number): string {
  return stops === 0 ? "مستقیم" : `${toFaDigits(stops)} توقف`;
}

export const FA_MONTHS = [
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

/** Indexed by JS weekday (0 = Sunday). */
const FA_WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export interface GregorianDate {
  gy: number;
  gm: number;
  gd: number;
}

// ---------------------------------------------------------------------------
// Jalali ⇄ Gregorian — jalaali-js algorithm (break-years rule), via Julian Day
// Numbers so both directions share one calendar model.
// ---------------------------------------------------------------------------

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - b * div(a, b);

/** Julian Day Number from a Gregorian date. */
function g2d(gy: number, gm: number, gd: number): number {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

/** Gregorian date from a Julian Day Number. */
function d2g(jdn: number): GregorianDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** Leap status (0 = leap) and the March day of Nowruz for a Jalali year. */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    const kk = k - 186;
    return { jy, jm: 7 + div(kk, 30), jd: mod(kk, 30) + 1 };
  }
  jy -= 1;
  let kk = k + 179;
  if (r.leap === 1) kk += 1;
  return { jy, jm: 7 + div(kk, 30), jd: mod(kk, 30) + 1 };
}

export function gregorianToJalali(g: GregorianDate): JalaliDate {
  return d2j(g2d(g.gy, g.gm, g.gd));
}

export function jalaliToGregorian(j: JalaliDate): GregorianDate {
  return d2g(j2d(j.jy, j.jm, j.jd));
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

/** Days in a Jalali month: 1–6 → 31, 7–11 → 30, 12 → 29/30. */
export function jMonthsLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

/** Column in a Persian week (Saturday = 0 … Friday = 6). */
export function persianWeekdayIndex(j: JalaliDate): number {
  return mod(j2d(j.jy, j.jm, j.jd) + 2, 7);
}

// ---------------------------------------------------------------------------
// Date keys (`yyyy-mm-dd`, Gregorian, as used in URLs and the API)
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

export function toDateKey(g: GregorianDate): string {
  return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
}

export function parseDateKey(key: string | null | undefined): GregorianDate | null {
  const m = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  if (!m) return null;
  const g = { gy: Number(m[1]), gm: Number(m[2]), gd: Number(m[3]) };
  // Round-trip rejects impossible dates such as 2025-02-30.
  const back = d2g(g2d(g.gy, g.gm, g.gd));
  return back.gy === g.gy && back.gm === g.gm && back.gd === g.gd ? g : null;
}

export function isValidDateKey(key: string | null | undefined): key is string {
  return parseDateKey(key) !== null;
}

export function jalaliFromKey(key: string): JalaliDate | null {
  const g = parseDateKey(key);
  return g ? gregorianToJalali(g) : null;
}

export function keyFromJalali(j: JalaliDate): string {
  return toDateKey(jalaliToGregorian(j));
}

// ---------------------------------------------------------------------------
// Tehran wall-clock helpers
// ---------------------------------------------------------------------------

interface TehranParts extends GregorianDate {
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

function tehranParts(epochMs: number): TehranParts {
  const d = new Date(epochMs + TEHRAN_OFFSET_MS);
  return {
    gy: d.getUTCFullYear(),
    gm: d.getUTCMonth() + 1,
    gd: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** Today's date key in Tehran. */
export function todayKey(now = Date.now()): string {
  return toDateKey(tehranParts(now));
}

export function epochToDateKey(epochMs: number): string {
  return toDateKey(tehranParts(epochMs));
}

/** "HH:mm" (ASCII) in Tehran — for `<input type="time">`. */
export function epochToTimeInput(epochMs: number): string {
  const p = tehranParts(epochMs);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Date key + "HH:mm" interpreted as Tehran time → epoch ms. */
export function tehranDateTimeToEpoch(key: string, time: string): number | null {
  const g = parseDateKey(key);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!g || !t) return null;
  return Date.UTC(g.gy, g.gm - 1, g.gd, Number(t[1]), Number(t[2])) - TEHRAN_OFFSET_MS;
}

export function addDaysToKey(key: string, days: number): string {
  const g = parseDateKey(key);
  if (!g) return key;
  return toDateKey(d2g(g2d(g.gy, g.gm, g.gd) + days));
}

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function dayDiff(fromKey: string, toKey: string): number {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  if (!a || !b) return NaN;
  return g2d(b.gy, b.gm, b.gd) - g2d(a.gy, a.gm, a.gd);
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

/** ۰۸:۳۵ (Tehran) */
export function formatTime(epochMs: number): string {
  const p = tehranParts(epochMs);
  return toFaDigits(`${pad2(p.hour)}:${pad2(p.minute)}`);
}

function formatJalali(j: JalaliDate, withYear: boolean): string {
  return `${toFaDigits(j.jd)} ${FA_MONTHS[j.jm - 1]}${withYear ? ` ${toFaDigits(j.jy)}` : ""}`;
}

/** ۱۴ مرداد ۱۴۰۴ */
export function formatJalaliDate(epochMs: number): string {
  return formatJalali(gregorianToJalali(tehranParts(epochMs)), true);
}

/** شنبه ۱۴ مرداد */
export function formatJalaliWeekday(epochMs: number): string {
  const p = tehranParts(epochMs);
  return `${FA_WEEKDAYS[p.weekday]} ${formatJalali(gregorianToJalali(p), false)}`;
}

/** Date key → "۱۴ مرداد ۱۴۰۴", or with `weekday` → "شنبه ۱۴ مرداد". */
export function formatDateKey(key: string, opts: { weekday?: boolean } = {}): string {
  const g = parseDateKey(key);
  if (!g) return "";
  const j = gregorianToJalali(g);
  if (!opts.weekday) return formatJalali(j, true);
  const weekday = FA_WEEKDAYS[mod(g2d(g.gy, g.gm, g.gd) + 1, 7)];
  return `${weekday} ${formatJalali(j, false)}`;
}

/** امروز / فردا / پس‌فردا / دیروز, else null. Accepts a date key or epoch ms. */
export function relativeDayLabel(date: string | number, now = Date.now()): string | null {
  const key = typeof date === "number" ? epochToDateKey(date) : date;
  const diff = dayDiff(todayKey(now), key);
  if (diff === 0) return "امروز";
  if (diff === 1) return "فردا";
  if (diff === 2) return "پس‌فردا";
  if (diff === -1) return "دیروز";
  return null;
}

/** "همین حالا", "۵ دقیقه پیش", "۳ ساعت پیش", "دیروز", else the date: for notifications and the like. */
export function formatRelativeTime(epochMs: number, now = Date.now()): string {
  const minutes = Math.floor((now - epochMs) / 60_000);
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${toFaDigits(minutes)} دقیقه پیش`;
  if (minutes < 24 * 60 && epochToDateKey(epochMs) === epochToDateKey(now)) {
    return `${toFaDigits(Math.floor(minutes / 60))} ساعت پیش`;
  }
  if (dayDiff(epochToDateKey(epochMs), epochToDateKey(now)) === 1) return "دیروز";
  return formatJalaliDate(epochMs);
}

/** Whole days between the departure and arrival calendar dates (Tehran), e.g. +1 for red-eyes. */
export function arrivalDayOffset(departAt: number, arriveAt: number): number {
  return dayDiff(epochToDateKey(departAt), epochToDateKey(arriveAt));
}
