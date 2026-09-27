import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Travellers' reports about an agency's offer (a price that differs from the
 * agency's site, a flight it no longer sells, …), for administrators to act on.
 */
export class ListingReports1790000012000 implements MigrationInterface {
  name = "ListingReports1790000012000";

  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE listing_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      listing_id uuid NOT NULL REFERENCES flight_listings(id) ON DELETE CASCADE,
      reporter_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      reason varchar(24) NOT NULL
        CHECK (reason IN ('price_mismatch', 'unavailable', 'wrong_details', 'broken_link', 'other')),
      -- What the agency's site asked, for price mismatches.
      observed_price bigint CHECK (observed_price > 0),
      note varchar(500) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      resolution varchar(16) CHECK (resolution IN ('suspended', 'dismissed')),
      CHECK ((resolved_at IS NULL) = (resolution IS NULL))
    )`);
    // One open report per person and offer; reporting again updates it.
    await q.query(
      `CREATE UNIQUE INDEX uq_listing_reports_open ON listing_reports (listing_id, reporter_id) WHERE resolved_at IS NULL`,
    );
    await q.query(`CREATE INDEX idx_listing_reports_reporter ON listing_reports (reporter_id, created_at DESC)`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS listing_reports`);
  }
}
