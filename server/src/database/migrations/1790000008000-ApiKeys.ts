import type { MigrationInterface, QueryRunner } from "typeorm";

/** Keys for the agency API. Only a SHA-256 of each key is kept; the prefix identifies it in the UI and in lookups. */
export class ApiKeys1790000008000 implements MigrationInterface {
  name = "ApiKeys1790000008000";

  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name varchar(60) NOT NULL,
      prefix varchar(16) NOT NULL UNIQUE,
      key_hash char(64) NOT NULL,
      last_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    )`);
    await q.query(`CREATE INDEX idx_api_keys_account ON api_keys (account_id, created_at DESC)`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS api_keys`);
  }
}
