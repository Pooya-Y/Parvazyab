import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One row per route per Tehran day: the lowest economy fare on offer that day for
 * flights departing within 30 days. Written by the worker; read by trend charts.
 */
export class RoutePriceSnapshots1790000002000 implements MigrationInterface {
  name = "RoutePriceSnapshots1790000002000";

  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE route_price_snapshots (
      origin_code varchar(8) NOT NULL,
      destination_code varchar(8) NOT NULL,
      snapshot_date date NOT NULL,
      min_price bigint NOT NULL CHECK (min_price > 0),
      avg_price bigint NOT NULL CHECK (avg_price > 0),
      offer_count integer NOT NULL CHECK (offer_count > 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (origin_code, destination_code, snapshot_date)
    )`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS route_price_snapshots`);
  }
}
