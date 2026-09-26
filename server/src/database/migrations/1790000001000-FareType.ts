import type { MigrationInterface, QueryRunner } from "typeorm";

/** Charter vs scheduled ("چارتری" / "سیستمی") per listing; existing listings are scheduled. */
export class FareType1790000001000 implements MigrationInterface {
  name = "FareType1790000001000";

  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE flight_listings ADD COLUMN fare_type varchar(16) NOT NULL DEFAULT 'scheduled'`);
    await q.query(
      `ALTER TABLE flight_listings ADD CONSTRAINT chk_flight_fare_type CHECK (fare_type IN ('scheduled', 'charter'))`,
    );
  }

  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE flight_listings DROP CONSTRAINT IF EXISTS chk_flight_fare_type`);
    await q.query(`ALTER TABLE flight_listings DROP COLUMN IF EXISTS fare_type`);
  }
}
