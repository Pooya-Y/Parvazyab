import type { MigrationInterface, QueryRunner } from "typeorm";

/** Browsers that asked for push notifications, per account. */
export class PushSubscriptions1790000011000 implements MigrationInterface {
  name = "PushSubscriptions1790000011000";

  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE push_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      -- The push service URL for this browser; unique: a browser belongs to whoever is signed in on it.
      endpoint text NOT NULL UNIQUE,
      p256dh varchar(200) NOT NULL,
      auth varchar(100) NOT NULL,
      user_agent varchar(200),
      failures smallint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_success_at timestamptz
    )`);
    await q.query(`CREATE INDEX idx_push_account ON push_subscriptions (account_id, created_at DESC)`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS push_subscriptions`);
  }
}
