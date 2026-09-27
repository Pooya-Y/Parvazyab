/**
 * Jalali (Solar Hijri) ⇄ Gregorian date keys, for files agencies write by hand.
 * Same algorithm as the client's lib/persian.ts (jalaali-js, via Julian Day
 * Numbers); the two copies must agree, and both are tested on known dates.
 */
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - b * div(a, b);

function g2d(gy: number, gm: number, gd: number): number {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn: number): [number, number, number] {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return [gy, gm, gd];
}

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

function d2j(jdn: number): [number, number, number] {
  const gy = d2g(jdn)[0];
  let jy = gy - 621;
  const r = jalCal(jy);
  const k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return [jy, 1 + div(k, 31), mod(k, 31) + 1];
    const kk = k - 186;
    return [jy, 7 + div(kk, 30), mod(kk, 30) + 1];
  }
  jy -= 1;
  let kk = k + 179;
  if (r.leap === 1) kk += 1;
  return [jy, 7 + div(kk, 30), mod(kk, 30) + 1];
}

const pad = (n: number) => String(n).padStart(2, "0");
const key = ([y, m, d]: [number, number, number]) => `${y}-${pad(m)}-${pad(d)}`;

/** Days in a Jalali month: 1–6 → 31, 7–11 → 30, Esfand → 29, or 30 in a leap year. */
function monthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCal(jy).leap === 0 ? 30 : 29;
}

/** "1405-07-04" → "2026-09-26", or null for a date that doesn't exist. */
export function jalaliToGregorianKey(jy: number, jm: number, jd: number): string | null {
  if (jm < 1 || jm > 12 || jd < 1 || jd > monthLength(jy, jm)) return null;
  return key(d2g(j2d(jy, jm, jd)));
}

/** "2026-09-26" → "1405-07-04". */
export function gregorianToJalaliKey(dateKey: string): string {
  const [gy, gm, gd] = dateKey.split("-").map(Number);
  return key(d2j(g2d(gy, gm, gd)));
}

/** Years people write in the Jalali calendar today; no Gregorian year a flight could have falls in here. */
export const isJalaliYear = (year: number) => year >= 1300 && year < 1500;
