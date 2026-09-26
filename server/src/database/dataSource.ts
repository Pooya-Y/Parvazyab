import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "../config/env";
import {
  AccountEntity,
  FlightListingEntity,
  SavedFlightEntity,
  PopularRouteEntity,
  AuthTokenEntity,
  AuditEntryEntity,
  PriceAlertEntity,
  NotificationEntity,
  type Account,
  type AppNotification,
  type PriceAlert,
  type AuthToken,
  type AuditEntry,
  type FlightListing,
  type SavedFlight,
  type PopularRoute,
} from "./entities";
import { InitialSchema1700000000000 } from "./migrations/1700000000000-InitialSchema";
import { FareType1790000001000 } from "./migrations/1790000001000-FareType";
import { RoutePriceSnapshots1790000002000 } from "./migrations/1790000002000-RoutePriceSnapshots";
import { ExploreIndex1790000003000 } from "./migrations/1790000003000-ExploreIndex";
import { AccountSecurity1790000004000 } from "./migrations/1790000004000-AccountSecurity";
import { PhoneSignIn1790000005000 } from "./migrations/1790000005000-PhoneSignIn";
import { PriceAlerts1790000006000 } from "./migrations/1790000006000-PriceAlerts";
import { ListingClicks1790000007000 } from "./migrations/1790000007000-ListingClicks";
import { ApiKeys1790000008000 } from "./migrations/1790000008000-ApiKeys";
import { AgencyProfiles1790000009000 } from "./migrations/1790000009000-AgencyProfiles";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: config.DATABASE_URL,
  synchronize: false,
  logging: config.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  entities: [
    AccountEntity,
    FlightListingEntity,
    SavedFlightEntity,
    PopularRouteEntity,
    AuthTokenEntity,
    AuditEntryEntity,
    PriceAlertEntity,
    NotificationEntity,
  ],
  // Imported as classes (not globs) so the same list works under tsx and compiled dist.
  migrations: [
    InitialSchema1700000000000,
    FareType1790000001000,
    RoutePriceSnapshots1790000002000,
    ExploreIndex1790000003000,
    AccountSecurity1790000004000,
    PhoneSignIn1790000005000,
    PriceAlerts1790000006000,
    ListingClicks1790000007000,
    ApiKeys1790000008000,
    AgencyProfiles1790000009000,
  ],
  migrationsTransactionMode: "each",
});

export const accounts = () => AppDataSource.getRepository<Account>(AccountEntity);
export const flightListings = () => AppDataSource.getRepository<FlightListing>(FlightListingEntity);
export const savedFlights = () => AppDataSource.getRepository<SavedFlight>(SavedFlightEntity);
export const popularRoutes = () => AppDataSource.getRepository<PopularRoute>(PopularRouteEntity);
export const authTokens = () => AppDataSource.getRepository<AuthToken>(AuthTokenEntity);
export const auditLog = () => AppDataSource.getRepository<AuditEntry>(AuditEntryEntity);
export const priceAlerts = () => AppDataSource.getRepository<PriceAlert>(PriceAlertEntity);
export const notifications = () => AppDataSource.getRepository<AppNotification>(NotificationEntity);

/** Postgres unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
