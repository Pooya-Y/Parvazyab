import { z } from "zod";
import { isKnownAirport } from "../domain/airports";
import { latinDigits, normalizeIranMobile } from "../domain/phone";
import { addDaysToDateKey, isValidDateKey, tehranTodayKey } from "../domain/time";
import { SORT_MODES } from "../services/flightsCore";
import { RANKING_MODES } from "../domain/rankingWeights";
import { EXPLORE_SCOPES } from "../services/explore";

export const FARE_TYPES = ["scheduled", "charter"] as const;

/** Query-string booleans: `z.coerce.boolean()` would treat "false" as true. */
const queryBoolean = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const hour = z.coerce.number().int().min(0).max(23);

export const airportCode = z.string().trim().toUpperCase().refine(isKnownAirport, { message: "UNKNOWN_AIRPORT" });

const dateKey = z.string().refine(isValidDateKey, { message: "INVALID_DATE" });

const routeShape = {
  originCode: airportCode,
  destinationCode: airportCode,
  date: dateKey.optional(),
};

function distinctRoute(v: { originCode: string; destinationCode: string }, ctx: z.RefinementCtx) {
  if (v.originCode === v.destinationCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationCode"], message: "SAME_ORIGIN_DESTINATION" });
  }
}

export const routeQuerySchema = z.object(routeShape).superRefine(distinctRoute);

/** Filters shared by search and the price calendar, so the two never disagree. */
const flightFilterShape = {
  airlines: z
    .string()
    .max(2000)
    .optional()
    .transform((s) =>
      s
        ?.split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    ),
  maxStops: z.coerce.number().int().min(0).max(3).optional(),
  cabin: z.enum(["economy", "business"]).optional(),
  fareType: z.enum(FARE_TYPES).optional(),
  directOnly: queryBoolean.optional(),
  departFromHour: hour.optional(),
  departToHour: hour.optional(),
  arriveFromHour: hour.optional(),
  arriveToHour: hour.optional(),
};

export const searchQuerySchema = z
  .object({
    ...routeShape,
    ...flightFilterShape,
    sort: z.enum(SORT_MODES).optional(),
    mode: z.enum(RANKING_MODES).optional(),
    maxPriceToman: z.coerce.number().positive().optional(),
  })
  .superRefine(distinctRoute);

export const MAX_CALENDAR_DAYS = 62;

export const calendarQuerySchema = z
  .object({
    originCode: airportCode,
    destinationCode: airportCode,
    start: dateKey,
    days: z.coerce.number().int().min(1).max(MAX_CALENDAR_DAYS).default(31),
    ...flightFilterShape,
  })
  .superRefine(distinctRoute);

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const exploreQuerySchema = z.object({
  originCode: airportCode,
  days: z.coerce.number().int().min(1).max(60).default(30),
  scope: z.enum(EXPLORE_SCOPES).default("all"),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

const emailField = z.string().trim().toLowerCase().email().max(320);
const nameField = z.string().trim().min(2).max(120);
/** For new passwords only; sign-in accepts whatever was allowed when the password was set. */
const newPasswordField = z.string().min(8).max(128);
/** Emailed tokens are 43 base64url characters; the bound only stops oversized input early. */
const tokenField = z.string().min(1).max(128);

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  password: newPasswordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({ email: emailField });
export const resetPasswordSchema = z.object({ token: tokenField, password: newPasswordField });
export const verifyEmailSchema = z.object({ token: tokenField });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPasswordField,
});
export const profileSchema = z.object({ name: nameField });
export const addEmailSchema = z.object({ email: emailField, password: newPasswordField });

const iranMobile = z
  .string()
  .max(32)
  .transform(normalizeIranMobile)
  .refine((phone): phone is string => phone !== null, { message: "INVALID_PHONE" });

export const otpRequestSchema = z.object({ phone: iranMobile });
export const otpVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z
    .string()
    .max(16)
    .transform(latinDigits)
    .pipe(z.string().regex(/^[0-9]{6}$/, "INVALID_OTP_FORMAT")),
});

const epochMs = z.number().int().nonnegative();
const cabin = z.enum(["economy", "business"]);
const fareType = z.enum(FARE_TYPES);

export const savedFlightSnapshotSchema = z.object({
  snapshot: z.object({
    id: z.string().min(1).max(255),
    airline: z.string().trim().min(1).max(120),
    flightNo: z.string().trim().min(1).max(16),
    originCode: airportCode,
    originCity: z.string().max(120),
    destinationCode: airportCode,
    destinationCity: z.string().max(120),
    departAt: epochMs,
    arriveAt: epochMs,
    durationMin: z.number().int().positive().max(10_000),
    stops: z.number().int().min(0).max(3),
    cabin,
    bestPriceToman: z.number().positive(),
    agencyName: z.string().trim().min(1).max(120),
  }),
});

export type SavedFlightSnapshot = z.infer<typeof savedFlightSnapshotSchema>["snapshot"];

/** Only http(s) links may be stored: `javascript:` URLs would execute when a user clicks "buy". */
export const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => URL.canParse(u) && /^https?:$/.test(new URL(u).protocol), { message: "INVALID_BOOKING_URL" });

export const listingSchema = z.object({
  id: z.string().uuid().optional(),
  originCode: airportCode,
  destinationCode: airportCode,
  airline: z.string().trim().min(1).max(120),
  flightNo: z.string().trim().min(1).max(16),
  departAt: epochMs,
  arriveAt: epochMs,
  stops: z.number().int().min(0).max(3),
  cabin,
  fareType: fareType.default("scheduled"),
  priceToman: z.number().positive().max(10_000_000_000),
  bookingUrl: httpUrl,
  isActive: z.boolean(),
});

export type ListingInput = z.infer<typeof listingSchema>;

export const listingStatusSchema = z.object({ isActive: z.boolean() });
export const becomeAgencySchema = z.object({ agencyName: z.string().trim().min(2).max(60) });
export const setRoleSchema = z.object({ accountRole: z.enum(["user", "agency"]) });
export const uuidParam = z.string().uuid();

// ---------------------------------------------------------------------------
// Price alerts and notifications
// ---------------------------------------------------------------------------

/** Longest date window an alert can watch, inclusive. */
export const MAX_ALERT_WINDOW_DAYS = 31;
const alertPrice = z.number().int().positive().max(10_000_000_000);

function alertWindow(v: { dateFrom?: string; dateTo?: string }, ctx: z.RefinementCtx) {
  if (!v.dateFrom !== !v.dateTo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "INCOMPLETE_DATE_RANGE" });
    return;
  }
  if (!v.dateFrom || !v.dateTo) return;
  if (v.dateTo < v.dateFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "INVALID_DATE_RANGE" });
  } else if (v.dateTo > addDaysToDateKey(v.dateFrom, MAX_ALERT_WINDOW_DAYS - 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "DATE_RANGE_TOO_LONG" });
  }
  if (v.dateTo < tehranTodayKey()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "DATE_IN_PAST" });
  }
}

export const alertSchema = z
  .object({
    originCode: airportCode,
    destinationCode: airportCode,
    /** Iran calendar days, inclusive; leave both out to watch the next 30 days. */
    dateFrom: dateKey.optional(),
    dateTo: dateKey.optional(),
    cabin: z.enum(["economy", "business"]).optional(),
    targetPrice: alertPrice.optional(),
    notifyEmail: z.boolean().default(true),
  })
  .superRefine(distinctRoute)
  .superRefine(alertWindow);
export type AlertInput = z.infer<typeof alertSchema>;

export const alertPatchSchema = z
  .object({
    isActive: z.boolean().optional(),
    /** null removes the target: notify on any real drop instead. */
    targetPrice: alertPrice.nullable().optional(),
    notifyEmail: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "EMPTY_UPDATE" });
export type AlertPatch = z.infer<typeof alertPatchSchema>;

export const notificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Epoch ms: page to notifications older than this. */
  before: z.coerce.number().int().positive().optional(),
});
export const markReadSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100).optional() });
export const unsubscribeQuerySchema = z.object({ sig: z.string().min(1).max(128) });
