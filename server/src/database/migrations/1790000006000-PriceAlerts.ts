import type { MigrationInterface, QueryRunner } from "typeorm";

/** Price-drop alerts on a route, and the in-app notifications they (and later features) produce. */
export class PriceAlerts1790000006000 implements MigrationInterface {
  name = "PriceAlerts1790000006000";

  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE price_alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      origin_code varchar(8) NOT NULL,
      destination_code varchar(8) NOT NULL,
      -- Iran calendar days, inclusive; both null means any date in the next 30 days.
      date_from date,
      date_to date,
      -- null means any cabin
      cabin varchar(20),
      target_price_toman bigint CHECK (target_price_toman > 0),
      -- The lowest fare when the alert was made: what "a drop" is measured against.
      baseline_price_toman bigint,
      last_price_toman bigint,
      last_checked_at timestamptz,
      last_notified_price_toman bigint,
      last_notified_at timestamptz,
      notify_email boolean NOT NULL DEFAULT true,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (origin_code <> destination_code),
      CHECK ((date_from IS NULL) = (date_to IS NULL)),
      CHECK (date_from IS NULL OR date_from <= date_to)
    )`);
    await q.query(`CREATE INDEX idx_alerts_account ON price_alerts (account_id, created_at DESC)`);
    await q.query(`CREATE INDEX idx_alerts_active ON price_alerts (id) WHERE is_active`);

    await q.query(`CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      kind varchar(32) NOT NULL,
      title varchar(200) NOT NULL,
      body text NOT NULL,
      -- An in-app path such as /search?from=THR&to=MHD; never an external URL.
      link varchar(500),
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (link IS NULL OR (link LIKE '/%' AND link NOT LIKE '//%'))
    )`);
    await q.query(`CREATE INDEX idx_notifications_account ON notifications (account_id, created_at DESC)`);
    await q.query(`CREATE INDEX idx_notifications_unread ON notifications (account_id) WHERE read_at IS NULL`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE IF EXISTS notifications`);
    await q.query(`DROP TABLE IF EXISTS price_alerts`);
  }
}
