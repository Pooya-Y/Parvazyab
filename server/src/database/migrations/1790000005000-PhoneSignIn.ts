import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Sign-in with a one-time SMS code. An account now has an email (with a
 * password), a verified mobile number, or both; at least one is required.
 */
export class PhoneSignIn1790000005000 implements MigrationInterface {
  name = "PhoneSignIn1790000005000";

  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE accounts ALTER COLUMN email DROP NOT NULL`);
    await q.query(`ALTER TABLE accounts ALTER COLUMN password_hash DROP NOT NULL`);
    // E.164 (+989xxxxxxxxx); only ever set once the number has been verified by code.
    await q.query(`ALTER TABLE accounts ADD COLUMN phone varchar(16) UNIQUE`);
    await q.query(`ALTER TABLE accounts ADD COLUMN phone_verified_at timestamptz`);
    await q.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_sign_in_method CHECK (email IS NOT NULL OR phone IS NOT NULL)`,
    );

    // The code itself is never stored: only an HMAC bound to the challenge id.
    await q.query(`CREATE TABLE otp_challenges (
      id uuid PRIMARY KEY,
      phone varchar(16) NOT NULL,
      purpose varchar(16) NOT NULL CHECK (purpose IN ('login', 'link')),
      account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
      code_hash char(64) NOT NULL,
      attempts smallint NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_otp_phone ON otp_challenges (phone, created_at DESC)`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS otp_challenges`);
    await q.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_sign_in_method`);
    await q.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS phone_verified_at`);
    await q.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS phone`);
    // Restoring NOT NULL fails while phone-only accounts exist; that data can't be represented any more.
    await q.query(`ALTER TABLE accounts ALTER COLUMN password_hash SET NOT NULL`);
    await q.query(`ALTER TABLE accounts ALTER COLUMN email SET NOT NULL`);
  }
}
