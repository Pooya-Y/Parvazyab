import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Outbound "buy" clicks, for agencies' analytics. No IP address and no account:
 * a visitor is a keyed hash of address and browser that changes every day,
 * enough to count unique visitors and nothing more.
 */
export class ListingClicks1790000007000 implements MigrationInterface {
  name = "ListingClicks1790000007000";

  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE listing_clicks (
      id bigserial PRIMARY KEY,
      -- Kept when a listing is deleted, so the agency's history stays whole.
      listing_id uuid REFERENCES flight_listings(id) ON DELETE SET NULL,
      agency_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      origin_code varchar(8) NOT NULL,
      destination_code varchar(8) NOT NULL,
      airline varchar(120) NOT NULL,
      flight_no varchar(16) NOT NULL,
      depart_at timestamptz NOT NULL,
      price_toman bigint NOT NULL,
      source varchar(16) NOT NULL,
      visitor_hash char(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_clicks_agency ON listing_clicks (agency_id, created_at DESC)`);
    await q.query(`CREATE INDEX idx_clicks_dedupe ON listing_clicks (listing_id, visitor_hash, created_at DESC)`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS listing_clicks`);
  }
}
