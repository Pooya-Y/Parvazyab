import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Moderation: suspending accounts and single listings, agencies asking to be
 * verified, and travellers reporting reviews.
 */
export class Moderation1790000010000 implements MigrationInterface {
  name = "Moderation1790000010000";

  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE accounts ADD COLUMN suspended_at timestamptz`);
    await q.query(`ALTER TABLE accounts ADD COLUMN suspension_reason varchar(300)`);
    await q.query(`ALTER TABLE flight_listings ADD COLUMN suspended_at timestamptz`);
    await q.query(`ALTER TABLE flight_listings ADD COLUMN suspension_reason varchar(300)`);
    await q.query(`ALTER TABLE agency_profiles ADD COLUMN verification_requested_at timestamptz`);

    await q.query(`CREATE TABLE review_reports (
      review_id uuid NOT NULL REFERENCES agency_reviews(id) ON DELETE CASCADE,
      reporter_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      reason varchar(300) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      PRIMARY KEY (review_id, reporter_id)
    )`);
    await q.query(`CREATE INDEX idx_review_reports_open ON review_reports (review_id) WHERE resolved_at IS NULL`);
    // The admin's queue of agencies waiting for verification.
    await q.query(
      `CREATE INDEX idx_profiles_verification ON agency_profiles (verification_requested_at)
        WHERE verification_requested_at IS NOT NULL AND verified_at IS NULL`,
    );
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS review_reports`);
    await q.query(`DROP INDEX IF EXISTS idx_profiles_verification`);
    await q.query(`ALTER TABLE agency_profiles DROP COLUMN IF EXISTS verification_requested_at`);
    await q.query(`ALTER TABLE flight_listings DROP COLUMN IF EXISTS suspension_reason`);
    await q.query(`ALTER TABLE flight_listings DROP COLUMN IF EXISTS suspended_at`);
    await q.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS suspension_reason`);
    await q.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS suspended_at`);
  }
}
