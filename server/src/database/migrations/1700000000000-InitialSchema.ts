import { MigrationInterface, QueryRunner } from "typeorm";
export class InitialSchema1700000000000 implements MigrationInterface {
  name = "InitialSchema1700000000000";
  async up(q: QueryRunner) {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await q.query(`CREATE TABLE IF NOT EXISTS accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role varchar(20) NOT NULL DEFAULT 'user',
      name varchar(120) NOT NULL, email varchar(320) NOT NULL UNIQUE, password_hash varchar(255) NOT NULL,
      agency_name varchar(120), created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE IF NOT EXISTS flight_listings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      origin_code varchar(8) NOT NULL, origin_city varchar(120) NOT NULL,
      destination_code varchar(8) NOT NULL, destination_city varchar(120) NOT NULL,
      airline varchar(120) NOT NULL, flight_no varchar(16) NOT NULL, depart_at timestamptz NOT NULL,
      arrive_at timestamptz NOT NULL, duration_min integer NOT NULL CHECK(duration_min>0),
      stops integer NOT NULL CHECK(stops BETWEEN 0 AND 3), cabin varchar(20) NOT NULL,
      price_toman bigint NOT NULL CHECK(price_toman>0), booking_url text NOT NULL, is_active boolean NOT NULL DEFAULT true
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_flight_route ON flight_listings(origin_code,destination_code)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_flight_account ON flight_listings(account_id)`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_flight_route_departure ON flight_listings(origin_code,destination_code,depart_at)`,
    );
    await q.query(`CREATE TABLE IF NOT EXISTS saved_flights (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      flight_key varchar(255) NOT NULL, airline varchar(120) NOT NULL, flight_no varchar(16) NOT NULL,
      origin_code varchar(8) NOT NULL, origin_city varchar(120) NOT NULL, destination_code varchar(8) NOT NULL,
      destination_city varchar(120) NOT NULL, depart_at timestamptz NOT NULL, arrive_at timestamptz NOT NULL,
      duration_min integer NOT NULL, stops integer NOT NULL, cabin varchar(20) NOT NULL,
      price_toman bigint NOT NULL, agency_name varchar(120) NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(account_id,flight_key)
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_saved_account ON saved_flights(account_id)`);
    await q.query(`CREATE TABLE IF NOT EXISTS popular_routes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), origin_code varchar(8) NOT NULL,
      destination_code varchar(8) NOT NULL, route_order integer NOT NULL
    )`);
  }
  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS saved_flights, flight_listings, popular_routes, accounts CASCADE`);
  }
}
