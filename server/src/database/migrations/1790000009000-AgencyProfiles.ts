import type { MigrationInterface, QueryRunner } from "typeorm";

/** Public agency profiles, and travellers' reviews of agencies. */
export class AgencyProfiles1790000009000 implements MigrationInterface {
  name = "AgencyProfiles1790000009000";

  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE agency_profiles (
      account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      -- The public address: /agencies/<slug>.
      slug varchar(40) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
      description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1200),
      website varchar(300),
      support_phone varchar(20),
      city varchar(60),
      license_no varchar(40),
      -- Set by an administrator once the agency's documents are checked.
      verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    // Every existing agency gets a profile, with a placeholder address it can change.
    await q.query(`INSERT INTO agency_profiles (account_id, slug)
                   SELECT id, 'agency-' || substr(md5(id::text), 1, 8) FROM accounts WHERE role = 'agency'`);

    await q.query(`CREATE TABLE agency_reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
      body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
      status varchar(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
      reply text CHECK (char_length(reply) <= 1000),
      replied_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (agency_id, author_id),
      CHECK (agency_id <> author_id)
    )`);
    await q.query(
      `CREATE INDEX idx_reviews_agency ON agency_reviews (agency_id, created_at DESC) WHERE status = 'published'`,
    );
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS agency_reviews`);
    await q.query(`DROP TABLE IF EXISTS agency_profiles`);
  }
}
