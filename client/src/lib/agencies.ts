import { toFaDigits } from "./persian";

/** 4.6 → "۴٫۶", 5 → "۵٫۰": ratings always show one decimal, with the Persian decimal separator. */
export function formatRating(value: number): string {
  return toFaDigits(value.toFixed(1)).replace(".", "٫");
}

/** Agency addresses: lowercase Latin letters, digits and inner hyphens (mirrors the server). */
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Suggests an address from free text: "Sky Travel!" → "sky-travel"; Persian-only names give "". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}
