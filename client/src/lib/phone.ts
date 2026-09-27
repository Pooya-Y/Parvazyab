import { toEnDigits, toFaDigits } from "./persian";

/**
 * Iranian mobile numbers, mirroring server/src/domain/phone.ts: whatever the
 * user typed (0912…, +98 912…, Persian digits, spaces) → E.164, or null.
 */
export function normalizeIranMobile(input: string): string | null {
  const compact = toEnDigits(input).replace(/[\s\-().‌]/g, "");
  const match = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(compact);
  return match ? `+98${match[1]}` : null;
}

/**
 * +989121234567 → "۰۹۱۲ ۱۲۳ ۴۵۶۷". The groups are separated by spaces, so render
 * it inside `<bdi dir="ltr">`: in RTL text the groups would otherwise reverse.
 */
export function formatMobile(e164: string): string {
  const national = `0${e164.slice(3)}`;
  return toFaDigits(`${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`);
}
