import { EntitySchema, type ValueTransformer } from "typeorm";

export type AccountRole = "admin" | "user" | "agency";
export type Cabin = "economy" | "business";
/** Scheduled ("سیستمی") seats are sold on the airline's fare rules; charter ("چارتری") seats on the charterer's. */
export type FareType = "scheduled" | "charter";

export interface Account {
  id: string;
  role: AccountRole;
  name: string;
  /** An account has an email (with a password), a verified mobile number, or both. */
  email: string | null;
  /** Null for accounts that only ever signed in by SMS code. */
  passwordHash: string | null;
  /** E.164; set only once verified by code. */
  phone: string | null;
  phoneVerifiedAt: Date | null;
  agencyName?: string | null;
  emailVerifiedAt: Date | null;
  /** Part of every session token; bumping it signs the account out everywhere. */
  sessionVersion: number;
  passwordChangedAt: Date | null;
  createdAt: Date;
}

export type AuthTokenPurpose = "password_reset" | "email_verify";

export interface AuthToken {
  id: string;
  accountId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  ipHash: string | null;
  createdAt: Date;
}
export interface FlightListing {
  id: string;
  accountId: string;
  originCode: string;
  originCity: string;
  destinationCode: string;
  destinationCity: string;
  airline: string;
  flightNo: string;
  departAt: Date;
  arriveAt: Date;
  durationMin: number;
  stops: number;
  cabin: Cabin;
  fareType: FareType;
  priceToman: number;
  bookingUrl: string;
  isActive: boolean;
}
export interface SavedFlight {
  id: string;
  accountId: string;
  flightKey: string;
  airline: string;
  flightNo: string;
  originCode: string;
  originCity: string;
  destinationCode: string;
  destinationCity: string;
  departAt: Date;
  arriveAt: Date;
  durationMin: number;
  stops: number;
  cabin: Cabin;
  priceToman: number;
  agencyName: string;
  savedAt: Date;
}
export interface PopularRoute {
  id: string;
  originCode: string;
  destinationCode: string;
  routeOrder: number;
}

/** node-postgres returns bigint as string; prices comfortably fit in a JS number. */
const bigintAsNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

// Column names are explicit because the migration uses snake_case.
export const AccountEntity = new EntitySchema<Account>({
  name: "Account",
  tableName: "accounts",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    role: { type: "varchar", length: 20, default: "user" },
    name: { type: "varchar", length: 120 },
    email: { type: "varchar", length: 320, unique: true, nullable: true },
    passwordHash: { name: "password_hash", type: "varchar", length: 255, nullable: true },
    phone: { type: "varchar", length: 16, unique: true, nullable: true },
    phoneVerifiedAt: { name: "phone_verified_at", type: "timestamptz", nullable: true },
    agencyName: { name: "agency_name", type: "varchar", length: 120, nullable: true },
    emailVerifiedAt: { name: "email_verified_at", type: "timestamptz", nullable: true },
    sessionVersion: { name: "session_version", type: "int", default: 0 },
    passwordChangedAt: { name: "password_changed_at", type: "timestamptz", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
});

export const AuthTokenEntity = new EntitySchema<AuthToken>({
  name: "AuthToken",
  tableName: "auth_tokens",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    accountId: { name: "account_id", type: "uuid" },
    purpose: { type: "varchar", length: 32 },
    tokenHash: { name: "token_hash", type: "char", length: 64 },
    expiresAt: { name: "expires_at", type: "timestamptz" },
    consumedAt: { name: "consumed_at", type: "timestamptz", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
});

/** bigserial ids come back from node-postgres as strings; keep them that way (they can exceed 2^53). */
export const AuditEntryEntity = new EntitySchema<AuditEntry>({
  name: "AuditEntry",
  tableName: "audit_log",
  columns: {
    id: { type: "bigint", primary: true, generated: "increment" },
    actorId: { name: "actor_id", type: "uuid", nullable: true },
    action: { type: "varchar", length: 64 },
    targetType: { name: "target_type", type: "varchar", length: 32, nullable: true },
    targetId: { name: "target_id", type: "varchar", length: 64, nullable: true },
    details: { type: "jsonb", default: {} },
    ipHash: { name: "ip_hash", type: "char", length: 64, nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
});

export const FlightListingEntity = new EntitySchema<FlightListing>({
  name: "FlightListing",
  tableName: "flight_listings",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    accountId: { name: "account_id", type: "uuid" },
    originCode: { name: "origin_code", type: "varchar", length: 8 },
    originCity: { name: "origin_city", type: "varchar", length: 120 },
    destinationCode: { name: "destination_code", type: "varchar", length: 8 },
    destinationCity: { name: "destination_city", type: "varchar", length: 120 },
    airline: { type: "varchar", length: 120 },
    flightNo: { name: "flight_no", type: "varchar", length: 16 },
    departAt: { name: "depart_at", type: "timestamptz" },
    arriveAt: { name: "arrive_at", type: "timestamptz" },
    durationMin: { name: "duration_min", type: "int" },
    stops: { type: "int" },
    cabin: { type: "varchar", length: 20 },
    fareType: { name: "fare_type", type: "varchar", length: 16, default: "scheduled" },
    priceToman: { name: "price_toman", type: "bigint", transformer: bigintAsNumber },
    bookingUrl: { name: "booking_url", type: "text" },
    isActive: { name: "is_active", type: "boolean", default: true },
  },
  indices: [
    { name: "idx_flight_route", columns: ["originCode", "destinationCode"] },
    { name: "idx_flight_account", columns: ["accountId"] },
    { name: "idx_flight_route_departure", columns: ["originCode", "destinationCode", "departAt"] },
  ],
});

export const SavedFlightEntity = new EntitySchema<SavedFlight>({
  name: "SavedFlight",
  tableName: "saved_flights",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    accountId: { name: "account_id", type: "uuid" },
    flightKey: { name: "flight_key", type: "varchar", length: 255 },
    airline: { type: "varchar", length: 120 },
    flightNo: { name: "flight_no", type: "varchar", length: 16 },
    originCode: { name: "origin_code", type: "varchar", length: 8 },
    originCity: { name: "origin_city", type: "varchar", length: 120 },
    destinationCode: { name: "destination_code", type: "varchar", length: 8 },
    destinationCity: { name: "destination_city", type: "varchar", length: 120 },
    departAt: { name: "depart_at", type: "timestamptz" },
    arriveAt: { name: "arrive_at", type: "timestamptz" },
    durationMin: { name: "duration_min", type: "int" },
    stops: { type: "int" },
    cabin: { type: "varchar", length: 20 },
    priceToman: { name: "price_toman", type: "bigint", transformer: bigintAsNumber },
    agencyName: { name: "agency_name", type: "varchar", length: 120 },
    savedAt: { name: "saved_at", type: "timestamptz", createDate: true },
  },
  indices: [
    { name: "uq_saved_account_flight", columns: ["accountId", "flightKey"], unique: true },
    { name: "idx_saved_account", columns: ["accountId"] },
  ],
});

export type AlertCabin = "economy" | "business";

export interface PriceAlert {
  id: string;
  accountId: string;
  originCode: string;
  destinationCode: string;
  /** `yyyy-mm-dd` Iran calendar days, inclusive; both null = any date in the next 30 days. */
  dateFrom: string | null;
  dateTo: string | null;
  cabin: AlertCabin | null;
  targetPriceToman: number | null;
  baselinePriceToman: number | null;
  lastPriceToman: number | null;
  lastCheckedAt: Date | null;
  lastNotifiedPriceToman: number | null;
  lastNotifiedAt: Date | null;
  notifyEmail: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface AppNotification {
  id: string;
  accountId: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export const PopularRouteEntity = new EntitySchema<PopularRoute>({
  name: "PopularRoute",
  tableName: "popular_routes",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    originCode: { name: "origin_code", type: "varchar", length: 8 },
    destinationCode: { name: "destination_code", type: "varchar", length: 8 },
    routeOrder: { name: "route_order", type: "int" },
  },
});

export const PriceAlertEntity = new EntitySchema<PriceAlert>({
  name: "PriceAlert",
  tableName: "price_alerts",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    accountId: { name: "account_id", type: "uuid" },
    originCode: { name: "origin_code", type: "varchar", length: 8 },
    destinationCode: { name: "destination_code", type: "varchar", length: 8 },
    dateFrom: { name: "date_from", type: "date", nullable: true },
    dateTo: { name: "date_to", type: "date", nullable: true },
    cabin: { type: "varchar", length: 20, nullable: true },
    targetPriceToman: { name: "target_price_toman", type: "bigint", nullable: true, transformer: bigintAsNumber },
    baselinePriceToman: { name: "baseline_price_toman", type: "bigint", nullable: true, transformer: bigintAsNumber },
    lastPriceToman: { name: "last_price_toman", type: "bigint", nullable: true, transformer: bigintAsNumber },
    lastCheckedAt: { name: "last_checked_at", type: "timestamptz", nullable: true },
    lastNotifiedPriceToman: {
      name: "last_notified_price_toman",
      type: "bigint",
      nullable: true,
      transformer: bigintAsNumber,
    },
    lastNotifiedAt: { name: "last_notified_at", type: "timestamptz", nullable: true },
    notifyEmail: { name: "notify_email", type: "boolean", default: true },
    isActive: { name: "is_active", type: "boolean", default: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
});

export const NotificationEntity = new EntitySchema<AppNotification>({
  name: "AppNotification",
  tableName: "notifications",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    accountId: { name: "account_id", type: "uuid" },
    kind: { type: "varchar", length: 32 },
    title: { type: "varchar", length: 200 },
    body: { type: "text" },
    link: { type: "varchar", length: 500, nullable: true },
    data: { type: "jsonb", default: {} },
    readAt: { name: "read_at", type: "timestamptz", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
});
