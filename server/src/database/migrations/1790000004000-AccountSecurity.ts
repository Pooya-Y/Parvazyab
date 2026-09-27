import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Email verification, password reset and revocable sessions, plus an audit log
 * of security-relevant and administrative actions.
 */
export class AccountSecurity1790000004000 implements MigrationInterface {
  name = "AccountSecurity1790000004000";

  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE accounts ADD COLUMN email_verified_at timestamptz`);
    // Bumped to invalidate every existing session (password change, "sign out everywhere").
    await q.query(`ALTER TABLE accounts ADD COLUMN session_version integer NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE accounts ADD COLUMN password_changed_at timestamptz`);

    // Only a SHA-256 of each token is stored; the token itself goes out by email.
    await q.query(`CREATE TABLE auth_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      purpose varchar(32) NOT NULL CHECK (purpose IN ('password_reset', 'email_verify')),
      token_hash char(64) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_auth_tokens_account ON auth_tokens (account_id, purpose, created_at DESC)`);

    await q.query(`CREATE TABLE audit_log (
      id bigserial PRIMARY KEY,
      actor_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
      action varchar(64) NOT NULL,
      target_type varchar(32),
      target_id varchar(64),
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      ip_hash char(64),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_audit_created ON audit_log (created_at DESC)`);
    await q.query(`CREATE INDEX idx_audit_action ON audit_log (action, created_at DESC)`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS audit_log`);
    await q.query(`DROP TABLE IF EXISTS auth_tokens`);
    await q.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS password_changed_at`);
    await q.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS session_version`);
    await q.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS email_verified_at`);
  }
}
