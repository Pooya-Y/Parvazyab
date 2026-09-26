import { EntitySchema, type ValueTransformer } from "typeorm";

export type AccountRole = "admin" | "user" | "agency";
export type Cabin = "economy" | "business";

export interface Account {
  id: string;
  role: AccountRole;
  name: string;
  email: string;
  passwordHash: string;
  agencyName?: string | null;
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
    email: { type: "varchar", length: 320, unique: true },
    passwordHash: { name: "password_hash", type: "varchar", length: 255 },
    agencyName: { name: "agency_name", type: "varchar", length: 120, nullable: true },
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
