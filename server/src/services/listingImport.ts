import type { ZodIssue } from "zod";
import { AppDataSource, flightListings } from "../database/dataSource";
import { FlightListingEntity, type FlightListing } from "../database/entities";
import { listingSchema, type ListingInput } from "../api/schemas";
import { latinDigits } from "../domain/phone";
import { gregorianToJalaliKey, isJalaliYear, jalaliToGregorianKey } from "../domain/jalali";
import { TEHRAN_OFFSET_MS, addDaysToDateKey, tehranDayBounds, tehranTodayKey } from "../domain/time";
import { HttpError } from "../http/errors";
import { CsvError, parseCsv, toCsv } from "../lib/csv";
import { invalidate } from "./redis";
import { SEARCH_CACHE_PREFIX } from "./flightService";
import { toListingColumns, type ListingColumns } from "./accountService";

/**
 * Bulk listing updates, shared by the CSV import and the partner API. Rows are
 * matched to the agency's existing listings by the real flight they describe
 * (route, airline, flight number, departure minute), so exporting, editing in a
 * spreadsheet and importing again updates in place instead of duplicating.
 */
export const MAX_IMPORT_ROWS = 2000;

/**
 * Spreadsheet columns, in export order. Times are Iran local time,
 * `yyyy-mm-dd HH:mm`, in the Jalali calendar (1405-07-08 08:30) or the
 * Gregorian one (2026-09-30 08:30): the year tells them apart.
 */
export const CSV_COLUMNS = [
  "origin",
  "destination",
  "airline",
  "flight_no",
  "depart",
  "arrive",
  "stops",
  "cabin",
  "fare_type",
  "price_toman",
  "booking_url",
  "active",
] as const;
type CsvColumn = (typeof CSV_COLUMNS)[number];
const REQUIRED_COLUMNS: CsvColumn[] = [
  "origin",
  "destination",
  "airline",
  "flight_no",
  "depart",
  "arrive",
  "price_toman",
  "booking_url",
];

/** Listing fields as CSV column names, so a CSV row's errors name its own columns. */
const FIELD_COLUMN: Record<string, CsvColumn> = {
  originCode: "origin",
  destinationCode: "destination",
  airline: "airline",
  flightNo: "flight_no",
  departAt: "depart",
  arriveAt: "arrive",
  stops: "stops",
  cabin: "cabin",
  fareType: "fare_type",
  priceToman: "price_toman",
  bookingUrl: "booking_url",
  isActive: "active",
};

export interface ImportRow {
  /** CSV line, or index in a JSON array. */
  ref: number;
  input?: Record<string, unknown>;
  errors: string[];
}

export type RowAction = "create" | "update" | "unchanged" | "error";

export interface RowReport {
  ref: number;
  action: RowAction;
  errors: string[];
  /** Existing listing for updates (and unchanged rows); the new one after a committed create. */
  id?: string;
  flight?: {
    originCode: string;
    destinationCode: string;
    airline: string;
    flightNo: string;
    departAt: number;
    priceToman: number;
  };
}

export interface ImportPlan {
  rows: RowReport[];
  counts: Record<RowAction, number>;
  creates: { ref: number; columns: ListingColumns }[];
  updates: { ref: number; id: string; columns: ListingColumns }[];
}

// ---------------------------------------------------------------------------
// Parsing cells
// ---------------------------------------------------------------------------

const DATETIME = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/;

/** "1405-07-08 08:30" or "2026-09-30 08:30", Iran time → epoch ms, or null. */
export function parseTehranDateTime(value: string): number | null {
  const m = DATETIME.exec(latinDigits(value).trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const dateKey = isJalaliYear(year)
    ? jalaliToGregorianKey(year, month, day)
    : `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const bounds = dateKey ? tehranDayBounds(dateKey) : null;
  return bounds ? bounds[0] + hour * 3_600_000 + minute * 60_000 : null;
}

/** epoch ms → "1405-07-08 08:30" (Jalali, the default) or "2026-09-30 08:30", in Iran time. */
export function formatTehranDateTime(epochMs: number, calendar: "jalali" | "gregorian" = "jalali"): string {
  const [date, time] = new Date(epochMs + TEHRAN_OFFSET_MS).toISOString().slice(0, 16).split("T");
  return `${calendar === "jalali" ? gregorianToJalaliKey(date) : date} ${time}`;
}

const TRUE = new Set(["true", "1", "yes", "y", "بله", "فعال"]);
const FALSE = new Set(["false", "0", "no", "n", "خیر", "غیرفعال"]);
const CABINS: Record<string, "economy" | "business"> = {
  economy: "economy",
  اکونومی: "economy",
  اقتصادی: "economy",
  business: "business",
  بیزینس: "business",
  تجاری: "business",
};
const FARE_TYPES: Record<string, "scheduled" | "charter"> = {
  scheduled: "scheduled",
  سیستمی: "scheduled",
  charter: "charter",
  چارتری: "charter",
};

/** "2,450,000", "۲٬۴۵۰٬۰۰۰" → 2450000. */
function parseWholeNumber(value: string): number | null {
  const compact = latinDigits(value).replace(/[\s,٬_]/g, "");
  return /^\d+$/.test(compact) ? Number(compact) : null;
}

const normalizeHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** Turns a CSV file into rows ready for planning; problems with the file as a whole throw. */
export function csvToRows(text: string): ImportRow[] {
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (err) {
    if (err instanceof CsvError)
      throw new HttpError(400, "CSV_MALFORMED", undefined, [`line ${err.line}: ${err.code}`]);
    throw err;
  }
  const [header, ...data] = parsed;
  if (!header) throw new HttpError(400, "CSV_EMPTY");
  const index = new Map(header.cells.map((h, i) => [normalizeHeader(h), i]));
  const missing = REQUIRED_COLUMNS.filter((c) => !index.has(c));
  if (missing.length) throw new HttpError(400, "CSV_MISSING_COLUMNS", undefined, missing);
  if (!data.length) throw new HttpError(400, "CSV_EMPTY");
  if (data.length > MAX_IMPORT_ROWS) throw new HttpError(413, "TOO_MANY_ROWS", undefined, [String(MAX_IMPORT_ROWS)]);

  return data.map(({ line, cells }) => {
    const get = (c: CsvColumn) => (index.has(c) ? (cells[index.get(c)!] ?? "").trim() : "");
    const errors: string[] = [];
    const time = (c: CsvColumn) => {
      const ms = parseTehranDateTime(get(c));
      if (ms === null) errors.push(`${c}: INVALID_DATETIME`);
      return ms;
    };
    const departAt = time("depart");
    const arriveAt = time("arrive");
    const price = parseWholeNumber(get("price_toman"));
    if (price === null) errors.push("price_toman: INVALID_NUMBER");
    const stopsText = get("stops");
    const stops = stopsText === "" ? 0 : parseWholeNumber(stopsText);
    if (stops === null) errors.push("stops: INVALID_NUMBER");
    const cabinText = get("cabin").toLowerCase();
    const cabin = cabinText === "" ? "economy" : CABINS[cabinText];
    if (!cabin) errors.push("cabin: INVALID_CABIN");
    const fareText = get("fare_type").toLowerCase();
    const fareType = fareText === "" ? "scheduled" : FARE_TYPES[fareText];
    if (!fareType) errors.push("fare_type: INVALID_FARE_TYPE");
    const activeText = get("active").toLowerCase();
    const isActive = activeText === "" || TRUE.has(activeText) ? true : FALSE.has(activeText) ? false : null;
    if (isActive === null) errors.push("active: INVALID_BOOLEAN");

    if (errors.length) return { ref: line, errors };
    return {
      ref: line,
      errors,
      input: {
        originCode: get("origin"),
        destinationCode: get("destination"),
        airline: get("airline"),
        flightNo: get("flight_no"),
        departAt,
        arriveAt,
        stops,
        cabin,
        fareType,
        priceToman: price,
        bookingUrl: get("booking_url"),
        isActive,
      },
    };
  });
}

/** Partner API rows: listing objects whose times may be ISO 8601 strings or epoch ms. */
export function jsonToRows(items: unknown[]): ImportRow[] {
  if (items.length > MAX_IMPORT_ROWS) throw new HttpError(413, "TOO_MANY_ROWS", undefined, [String(MAX_IMPORT_ROWS)]);
  return items.map((item, ref) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return { ref, errors: ["INVALID_ROW"] };
    const input: Record<string, unknown> = { ...(item as Record<string, unknown>) };
    delete input.id;
    const errors: string[] = [];
    for (const key of ["departAt", "arriveAt"]) {
      if (typeof input[key] === "string") {
        const ms = Date.parse(input[key]);
        if (Number.isNaN(ms)) errors.push(`${key}: INVALID_DATETIME`);
        else input[key] = ms;
      }
    }
    if (input.fareType === undefined) input.fareType = "scheduled";
    if (input.isActive === undefined) input.isActive = true;
    if (input.stops === undefined) input.stops = 0;
    return errors.length ? { ref, errors } : { ref, errors, input };
  });
}

// ---------------------------------------------------------------------------
// Planning and applying
// ---------------------------------------------------------------------------

/** Zod's own messages are English prose; reduce them to codes the client can translate. */
function issueCode(issue: ZodIssue): string {
  if (issue.code === "custom") return issue.message;
  if (issue.code === "invalid_type") return issue.received === "undefined" ? "REQUIRED" : "INVALID_VALUE";
  if (issue.code === "too_small" || issue.code === "too_big") return "OUT_OF_RANGE";
  return "INVALID_VALUE";
}

/** Times compare to the minute: files and forms carry minutes, stored rows may carry seconds. */
const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
const identity = (c: Pick<ListingColumns, "originCode" | "destinationCode" | "airline" | "flightNo" | "departAt">) =>
  `${c.originCode}|${c.destinationCode}|${c.airline}|${c.flightNo}|${minute(c.departAt)}`;

const COMPARED: (keyof ListingColumns)[] = [
  "arriveAt",
  "stops",
  "cabin",
  "fareType",
  "priceToman",
  "bookingUrl",
  "isActive",
];
const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? minute(a) === minute(b) : a === b);

/**
 * Validates every row and decides what it would do, without writing anything.
 * `columnNames` reports errors by CSV column rather than API field.
 */
export async function planImport(
  accountId: string,
  rows: ImportRow[],
  { columnNames = false, now = Date.now() }: { columnNames?: boolean; now?: number } = {},
): Promise<ImportPlan> {
  const name = (path: (string | number)[]) => {
    const field = String(path[0] ?? "");
    return columnNames ? (FIELD_COLUMN[field] ?? field) : field;
  };
  const checked = rows.map((row) => {
    if (!row.input) return { row, errors: row.errors };
    const parsed = listingSchema.safeParse(row.input);
    if (!parsed.success) {
      return { row, errors: parsed.error.issues.map((i) => `${name(i.path)}: ${issueCode(i)}`) };
    }
    let columns: ListingColumns;
    try {
      columns = toListingColumns(parsed.data as ListingInput);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      const field =
        err.code === "ARRIVAL_BEFORE_DEPARTURE"
          ? "arriveAt"
          : err.code === "UNKNOWN_AIRPORT"
            ? "originCode"
            : "destinationCode";
      return { row, errors: [`${name([field])}: ${err.code}`] };
    }
    if (columns.departAt.getTime() <= now) return { row, errors: [`${name(["departAt"])}: DEPARTURE_IN_PAST`] };
    return { row, errors: [] as string[], columns };
  });

  const valid = checked.filter((c): c is typeof c & { columns: ListingColumns } => "columns" in c && !!c.columns);
  const existing = new Map<string, FlightListing>();
  if (valid.length) {
    const times = valid.map((v) => v.columns.departAt.getTime());
    const found = await flightListings()
      .createQueryBuilder("f")
      .where("f.accountId = :accountId", { accountId })
      // Identity is per departure minute, so the window must cover the whole last minute.
      .andWhere("f.departAt BETWEEN :from AND :to", {
        from: new Date(Math.min(...times)),
        to: new Date(Math.max(...times) + 59_999),
      })
      .getMany();
    for (const listing of found) existing.set(identity(listing), listing);
  }

  const plan: ImportPlan = {
    rows: [],
    counts: { create: 0, update: 0, unchanged: 0, error: 0 },
    creates: [],
    updates: [],
  };
  const seen = new Set<string>();
  for (const c of checked) {
    const ref = c.row.ref;
    if (!("columns" in c) || !c.columns) {
      plan.rows.push({ ref, action: "error", errors: c.errors });
      plan.counts.error++;
      continue;
    }
    const cols = c.columns;
    const key = identity(cols);
    const flight = {
      originCode: cols.originCode,
      destinationCode: cols.destinationCode,
      airline: cols.airline,
      flightNo: cols.flightNo,
      departAt: cols.departAt.getTime(),
      priceToman: cols.priceToman,
    };
    if (seen.has(key)) {
      plan.rows.push({ ref, action: "error", errors: [`${name(["flightNo"])}: DUPLICATE_ROW`], flight });
      plan.counts.error++;
      continue;
    }
    seen.add(key);
    const match = existing.get(key);
    if (!match) {
      plan.rows.push({ ref, action: "create", errors: [], flight });
      plan.creates.push({ ref, columns: cols });
      plan.counts.create++;
    } else if (COMPARED.some((f) => !same(match[f as keyof FlightListing], cols[f]))) {
      plan.rows.push({ ref, action: "update", errors: [], id: match.id, flight });
      plan.updates.push({ ref, id: match.id, columns: cols });
      plan.counts.update++;
    } else {
      plan.rows.push({ ref, action: "unchanged", errors: [], id: match.id, flight });
      plan.counts.unchanged++;
    }
  }
  return plan;
}

/** Writes a plan's creates and updates in one transaction; new ids are filled into the report. */
export async function applyImport(accountId: string, plan: ImportPlan): Promise<void> {
  if (!plan.creates.length && !plan.updates.length) return;
  const newIds = new Map<number, string>();
  await AppDataSource.transaction(async (m) => {
    const repo = m.getRepository<FlightListing>(FlightListingEntity);
    for (let i = 0; i < plan.creates.length; i += 200) {
      const chunk = plan.creates.slice(i, i + 200);
      const result = await repo.insert(chunk.map((c) => ({ ...c.columns, accountId })));
      result.identifiers.forEach((ident, j) => newIds.set(chunk[j].ref, String(ident.id)));
    }
    for (const u of plan.updates) await repo.update({ id: u.id, accountId }, u.columns);
  });
  for (const row of plan.rows) if (newIds.has(row.ref)) row.id = newIds.get(row.ref);
  await invalidate(SEARCH_CACHE_PREFIX);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function csvRow(l: Pick<FlightListing, keyof ListingColumns>) {
  return [
    l.originCode,
    l.destinationCode,
    l.airline,
    l.flightNo,
    formatTehranDateTime(l.departAt.getTime()),
    formatTehranDateTime(l.arriveAt.getTime()),
    l.stops,
    l.cabin,
    l.fareType,
    l.priceToman,
    l.bookingUrl,
    l.isActive,
  ];
}

/** The agency's listings as CSV, in the same shape the import reads. */
export async function listingsCsv(accountId: string): Promise<string> {
  const rows = await flightListings().find({ where: { accountId }, order: { departAt: "ASC" } });
  return toCsv([[...CSV_COLUMNS], ...rows.map(csvRow)]);
}

/** A starter file: the header and two example rows a week out. */
export function templateCsv(now = Date.now()): string {
  const day = gregorianToJalaliKey(addDaysToDateKey(tehranTodayKey(now), 7));
  return toCsv([
    [...CSV_COLUMNS],
    [
      "THR",
      "MHD",
      "ماهان ایر",
      "W5-1071",
      `${day} 08:30`,
      `${day} 10:00`,
      0,
      "economy",
      "scheduled",
      2450000,
      "https://example.com/book/W5-1071",
      true,
    ],
    [
      "THR",
      "KIH",
      "کیش ایر",
      "Y9-7012",
      `${day} 14:10`,
      `${day} 16:05`,
      0,
      "economy",
      "charter",
      3100000,
      "https://example.com/book/Y9-7012",
      true,
    ],
  ]);
}
