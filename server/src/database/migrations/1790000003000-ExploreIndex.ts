import type { MigrationInterface, QueryRunner } from "typeorm";

/** "Cheapest destinations from X" scans active listings by origin and departure time. */
export class ExploreIndex1790000003000 implements MigrationInterface {
  name = "ExploreIndex1790000003000";

  async up(q: QueryRunner) {
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_flight_origin_departure_active ON flight_listings (origin_code, depart_at) WHERE is_active`,
    );
  }

  async down(q: QueryRunner) {
    await q.query(`DROP INDEX IF EXISTS idx_flight_origin_departure_active`);
  }
}
