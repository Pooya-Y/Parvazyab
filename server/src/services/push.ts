import { AppDataSource } from "../database/dataSource";
import { HttpError } from "../http/errors";
import { isAllowedPushEndpoint, pushEnabled, sendPush, type PushMessage, type PushTarget } from "../notify/push";

/** A person rarely has more devices than this; the oldest subscriptions give way. */
const MAX_DEVICES = 10;
/** Consecutive failures after which a subscription is dropped. */
const MAX_FAILURES = 5;

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Remembers a browser's subscription for the signed-in account. The same
 * browser signing in as someone else moves the subscription with it.
 */
export async function saveSubscription(accountId: string, input: SubscriptionInput, userAgent: string | undefined) {
  if (!pushEnabled()) throw new HttpError(503, "PUSH_UNAVAILABLE");
  if (!isAllowedPushEndpoint(input.endpoint)) throw new HttpError(400, "PUSH_ENDPOINT_NOT_ALLOWED");
  await AppDataSource.query(
    `INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET account_id = EXCLUDED.account_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent, failures = 0, created_at = now()`,
    [accountId, input.endpoint, input.keys.p256dh, input.keys.auth, userAgent?.slice(0, 200) ?? null],
  );
  await AppDataSource.query(
    `DELETE FROM push_subscriptions WHERE id IN (
       SELECT id FROM push_subscriptions WHERE account_id = $1 ORDER BY created_at DESC OFFSET $2
     )`,
    [accountId, MAX_DEVICES],
  );
}

export async function deleteSubscription(accountId: string, endpoint: string) {
  await AppDataSource.query(`DELETE FROM push_subscriptions WHERE account_id = $1 AND endpoint = $2`, [
    accountId,
    endpoint,
  ]);
}

/** Pushes one message to every browser of an account, pruning subscriptions that are gone or keep failing. */
export async function pushToAccount(accountId: string, message: PushMessage): Promise<number> {
  if (!pushEnabled()) return 0;
  const targets = (await AppDataSource.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE account_id = $1`,
    [accountId],
  )) as (PushTarget & { id: string })[];
  let sent = 0;
  for (const target of targets) {
    const outcome = await sendPush(target, message);
    if (outcome === "sent") {
      sent++;
      await AppDataSource.query(`UPDATE push_subscriptions SET failures = 0, last_success_at = now() WHERE id = $1`, [
        target.id,
      ]);
    } else if (outcome === "gone") {
      await AppDataSource.query(`DELETE FROM push_subscriptions WHERE id = $1`, [target.id]);
    } else {
      // Two statements: Postgres doesn't reliably update and delete one row in a single statement.
      const [row] = (await AppDataSource.query(
        `WITH bumped AS (
           UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1 RETURNING failures
         )
         SELECT failures FROM bumped`,
        [target.id],
      )) as { failures: number }[];
      if (row && row.failures >= MAX_FAILURES) {
        await AppDataSource.query(`DELETE FROM push_subscriptions WHERE id = $1`, [target.id]);
      }
    }
  }
  return sent;
}
