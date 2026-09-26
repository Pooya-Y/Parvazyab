import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "../config/env";
import {
  AccountEntity,
  FlightListingEntity,
  SavedFlightEntity,
  PopularRouteEntity,
  type Account,
  type FlightListing,
  type SavedFlight,
  type PopularRoute,
} from "./entities";
import { InitialSchema1700000000000 } from "./migrations/1700000000000-InitialSchema";
import { FareType1790000001000 } from "./migrations/1790000001000-FareType";
import { RoutePriceSnapshots1790000002000 } from "./migrations/1790000002000-RoutePriceSnapshots";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: config.DATABASE_URL,
  synchronize: false,
  logging: config.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  entities: [AccountEntity, FlightListingEntity, SavedFlightEntity, PopularRouteEntity],
  // Imported as classes (not globs) so the same list works under tsx and compiled dist.
  migrations: [InitialSchema1700000000000, FareType1790000001000, RoutePriceSnapshots1790000002000],
  migrationsTransactionMode: "each",
});

export const accounts = () => AppDataSource.getRepository<Account>(AccountEntity);
export const flightListings = () => AppDataSource.getRepository<FlightListing>(FlightListingEntity);
export const savedFlights = () => AppDataSource.getRepository<SavedFlight>(SavedFlightEntity);
export const popularRoutes = () => AppDataSource.getRepository<PopularRoute>(PopularRouteEntity);

/** Postgres unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
