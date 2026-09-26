/**
 * Iranian mobile numbers. Stored and compared in E.164 (+989xxxxxxxxx); users
 * type them every way imaginable: 0912…, 912…, +98 912…, 0098…, with spaces or
 * dashes, in Persian or Arabic-Indic digits.
 */
const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;

export function latinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code - (code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_ZERO));
  });
}

export function normalizeIranMobile(input: string): string | null {
  const compact = latinDigits(input).replace(/[\s\-().‌]/g, "");
  const match = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(compact);
  return match ? `+98${match[1]}` : null;
}

/** 09121234567: the form Iranian SMS gateways and people expect. */
export const nationalMobile = (e164: string) => `0${e164.slice(3)}`;
